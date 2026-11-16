/**
 * Seeds a 4-frame photo story on the dev Bois & Chiffons brand through the real server path (resolveSource, then
 * saveStoryVersion with a person actor), from photos the brand already has. No AI calls: Quality's rule-based checks
 * are run here and recorded in place of its AI review, so the story waits for approval like a real one.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/seed-story.ts [--status draft|approved] [--brand <brandId>]   (prints the item id)
 *   npx tsx --conditions=react-server --env-file=.env scripts/seed-story.ts --reel <file.mp4>   (a finished studio reel, for Generate → Use in story)
 *   npx tsx --conditions=react-server --env-file=.env scripts/seed-story.ts --remove <itemId>
 *
 * draft: written by admin@cmo.local, waiting for approval (the e2e account approves it). approved: also approved by
 * emu-test@cmo.local. Rendered files stay in storage (content-addressed, shared by identical frames).
 *
 * --reel: copies the MP4 into the brand's media and records a studio reel whose render is DONE with that videoKey, as
 * if Higgsfield had made it (no credits spent), with a passing check so the review screen doesn't start one. Its scenes
 * point at the brand's photoshoot photos. The MP4 stays in storage after --remove.
 *
 * Guards (seed and --remove): only the pinned dev workspace and brand, never NODE_ENV=production, and only when the
 * DATABASE_URL host is listed in SEED_ALLOW_DB_HOSTS (comma-separated host names).
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Prisma } from "@prisma/client";
import { overallOf } from "@/server/content/rules";
import { prisma } from "@/server/db/prisma";
import { decide } from "@/server/services/publishing";
import { checkStory } from "@/server/stories/checks";
import { isStoryBody, type SourceRef, type StoryInput } from "@/server/stories/body";
import { saveStoryVersion } from "@/server/stories/service";
import { toVersionBody, type ReelPlan } from "@/server/reels/plan";
import { mediaKey, putMedia } from "@/server/storage/media";

const WRITER = "admin@cmo.local";
const APPROVER = "emu-test@cmo.local";
const MARK = "Seeded story";
const REEL_MARK = "Seeded reel";
const WORKSPACE_ID = "cmvhqkx8h0001v630qd3rb7gb";
const BRAND_ID = "cmvuozmxd0009v640auzx32f3";

function guard() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed with NODE_ENV=production.");
  const host = new URL(process.env.DATABASE_URL ?? "postgres://none").hostname;
  const allowed = (process.env.SEED_ALLOW_DB_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  if (!allowed.includes(host)) throw new Error(`Refusing: database host ${host} is not in SEED_ALLOW_DB_HOSTS.`);
  if (arg("brand") !== undefined && arg("brand") !== BRAND_ID) throw new Error("Refusing: --brand must be the pinned dev brand.");
}
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function remove(id: string) {
  const seeded = { OR: [{ channel: "INSTAGRAM_STORY" as const, title: { startsWith: MARK } }, { channel: "INSTAGRAM_REEL" as const, studio: true, title: { startsWith: REEL_MARK } }] };
  const { count } = await prisma.contentItem.deleteMany({ where: { id, workspaceId: WORKSPACE_ID, brandId: BRAND_ID, ...seeded } });
  if (count === 0) throw new Error(`${id} is not a seeded story or reel of the dev brand.`);
  console.log(`removed ${id}`);
}

async function seed(status: string) {
  const ws = { id: WORKSPACE_ID };
  const brand = await prisma.brand.findFirstOrThrow({ where: { id: BRAND_ID, workspaceId: WORKSPACE_ID }, select: { id: true } });
  const [writer, approver] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { email: WRITER } }), prisma.user.findUniqueOrThrow({ where: { email: APPROVER } })]);
  const scope = { workspaceId: ws.id, brandId: brand.id, userId: writer.id };

  const shoots = await prisma.photoShoot.findMany({ where: { workspaceId: ws.id, brandId: brand.id, status: "DONE" }, orderBy: { createdAt: "desc" }, select: { outputKeys: true } });
  const keys = shoots.flatMap((s) => s.outputKeys).slice(0, 4);
  if (keys.length < 4) throw new Error("Needs 4 finished photoshoot photos on the brand.");
  const text = [
    ["Nouveauté", "La chaise Julia", "Chêne massif, assise en lin."],
    ["Fait main", "Du bois et du tissu", "Assemblée dans notre atelier."],
    ["Détail", "Un lin qui vit", "Lavé, doux, durable."],
    ["Chez vous", "Prête pour la table", "Livrée en 10 jours."],
  ];
  const input: StoryInput = {
    frames: keys.map((id, i) => ({ source: { kind: "photoshoot", id } satisfies SourceRef, label: text[i][0], headline: text[i][1], body: text[i][2] })),
    cta: "Découvrir",
    link: "https://boisetchiffons.example/julia",
    brandMark: false,
  };

  const item = await prisma.contentItem.create({
    data: { workspaceId: ws.id, brandId: brand.id, title: `${MARK}: la chaise Julia`, channel: "INSTAGRAM_STORY", status: "PLANNED", brief: { seed: "story-web" } },
  });
  try {
    const saved = await saveStoryVersion(scope, item.id, 0, input, { kind: "person", userId: writer.id }, { photosOnly: true });
    if (saved.status !== "saved") throw new Error("Photo stories render in the request; got " + saved.status);

    // Quality without its AI review: the story rules, recorded as the check, then the item waits for approval.
    const version = await prisma.contentVersion.findFirstOrThrow({ where: { contentItemId: item.id, version: saved.version } });
    if (!isStoryBody(version.body)) throw new Error("Saved version is not a story");
    const results = checkStory(version.body);
    const overall = overallOf(results);
    await prisma.qualityCheck.create({ data: { contentVersionId: version.id, overall, results: results as unknown as Prisma.InputJsonValue } });
    await prisma.contentItem.update({ where: { id: item.id }, data: { status: overall === "BLOCKER" ? "DRAFT_REVIEW" : "AWAITING_APPROVAL" } });
    if (status === "approved") await decide({ ...scope, userId: approver.id, itemId: item.id, version: saved.version, verdict: "APPROVED" });

    console.log(JSON.stringify({ itemId: item.id, workspaceId: ws.id, brandId: brand.id, status: overall === "BLOCKER" ? "DRAFT_REVIEW" : status === "approved" ? "APPROVED" : "AWAITING_APPROVAL", check: overall }));
  } catch (e) {
    // No orphan: nothing was printed, so nobody could remove it.
    await prisma.contentItem.deleteMany({ where: { id: item.id } });
    throw e;
  }
}

async function seedReel(file: string) {
  const scope = { workspaceId: WORKSPACE_ID, brandId: BRAND_ID };
  const writer = await prisma.user.findUniqueOrThrow({ where: { email: WRITER } });
  const shoots = await prisma.photoShoot.findMany({ where: { ...scope, status: "DONE" }, orderBy: { createdAt: "desc" }, select: { outputKeys: true } });
  const photos = shoots.flatMap((s) => s.outputKeys).slice(0, 2);
  if (photos.length < 2) throw new Error("Needs 2 finished photoshoot photos on the brand.");
  const videoKey = mediaKey(scope, `${randomUUID()}.mp4`);
  await putMedia(videoKey, await readFile(file), "video/mp4");
  const plan: ReelPlan = {
    title: "La chaise Julia en 15 secondes",
    presenter: "none",
    template: "",
    voice: "alloy",
    language: "fr",
    scenes: photos.map((photoKey, i) => ({ photoKey, shot: "Plan large", direction: "", onScreenText: i ? "Chêne et lin" : "La chaise Julia", voiceText: i ? "Chêne massif et lin lavé." : "Voici la chaise Julia." })),
    caption: "La chaise Julia, faite main.",
    hashtags: [],
  };
  const item = await prisma.contentItem.create({
    data: {
      ...scope, title: `${REEL_MARK}: ${plan.title}`, channel: "INSTAGRAM_REEL", studio: true, status: "AWAITING_APPROVAL", brief: { seed: "story-reel" },
      versions: { create: { version: 1, body: { ...toVersionBody(plan), videoKey }, createdBy: writer.id } },
    },
    include: { versions: true },
  });
  const version = item.versions[0];
  await prisma.reelRender.create({ data: { ...scope, contentItemId: item.id, contentVersionId: version.id, attempt: 1, step: "DONE", videoKey, chargeId: `seed-${randomUUID()}`, webhookSecret: randomUUID() } });
  await prisma.qualityCheck.create({ data: { contentVersionId: version.id, overall: "PASS", results: [] } });
  console.log(JSON.stringify({ itemId: item.id, videoKey }));
}

async function main() {
  guard();
  const rm = arg("remove");
  if (rm) return remove(rm);
  const reel = arg("reel");
  if (reel) return seedReel(reel);
  const status = arg("status") ?? "draft";
  if (status !== "draft" && status !== "approved") throw new Error("--status draft|approved");
  return seed(status);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
