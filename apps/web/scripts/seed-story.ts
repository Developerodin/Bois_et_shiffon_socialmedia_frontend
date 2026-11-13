/**
 * Seeds a 4-frame photo story on the dev Bois & Chiffons brand through the real server path (resolveSource, then
 * saveStoryVersion with a person actor), from photos the brand already has. No AI calls: Quality's rule-based checks
 * are run here and recorded in place of its AI review, so the story waits for approval like a real one.
 *
 *   npx tsx --env-file=.env scripts/seed-story.ts [--status draft|approved] [--brand <brandId>]   (prints the item id)
 *   npx tsx --env-file=.env scripts/seed-story.ts --remove <itemId>
 *
 * draft: written by admin@cmo.local, waiting for approval (the e2e account approves it). approved: also approved by
 * emu-test@cmo.local. Rendered files stay in storage (content-addressed, shared by identical frames).
 *
 * Guards (seed and --remove): only the pinned dev workspace and brand, never NODE_ENV=production, and only when the
 * DATABASE_URL host is listed in SEED_ALLOW_DB_HOSTS (comma-separated host names).
 */
import type { Prisma } from "@prisma/client";
import { overallOf } from "@/server/content/rules";
import { prisma } from "@/server/db/prisma";
import { decide } from "@/server/services/publishing";
import { checkStory } from "@/server/stories/checks";
import { isStoryBody, type SourceRef, type StoryInput } from "@/server/stories/body";
import { saveStoryVersion } from "@/server/stories/service";

const WRITER = "admin@cmo.local";
const APPROVER = "emu-test@cmo.local";
const MARK = "Seeded story";
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
  const { count } = await prisma.contentItem.deleteMany({ where: { id, workspaceId: WORKSPACE_ID, brandId: BRAND_ID, channel: "INSTAGRAM_STORY", title: { startsWith: MARK } } });
  if (count === 0) throw new Error(`${id} is not a seeded story of the dev brand.`);
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

async function main() {
  guard();
  const rm = arg("remove");
  if (rm) return remove(rm);
  const status = arg("status") ?? "draft";
  if (status !== "draft" && status !== "approved") throw new Error("--status draft|approved");
  return seed(status);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
