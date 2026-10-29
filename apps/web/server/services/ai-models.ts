import { Prisma, type AiTierName } from "@prisma/client";
import { z } from "zod";
import { forgetModelConfig } from "@/server/ai/model-config";
import { prisma } from "@/server/db/prisma";

/**
 * Platform admin → AI models (platform admins): the models the app may call with their prices, and which one each tier
 * uses. Every change is checked, recorded as an AuditEvent, and live within a minute everywhere (at once on the
 * server that saved it; server/ai/model-config.ts).
 */
export class AiModelSettingsError extends Error {
  constructor(message: string, readonly status: 409 | 422 | 502) {
    super(message);
  }
}

const price = z.number().min(0).max(10_000);
export const ModelInput = z
  .object({
    // The provider's model id, exactly as the API takes it.
    name: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/, "Use the model id exactly as OpenAI lists it (letters, digits, . _ : -)."),
    inputUsdPerM: price,
    cachedUsdPerM: price,
    outputUsdPerM: price,
    cacheBreakpoints: z.boolean(),
    evalCandidate: z.boolean(),
    judgeRank: z.union([z.literal(1), z.literal(2)]).nullable(),
  })
  .refine((m) => m.cachedUsdPerM <= m.inputUsdPerM, { message: "The cached input price can't be higher than the input price.", path: ["cachedUsdPerM"] });
export const TierInput = z
  .object({ tier: z.enum(["heavy", "medium", "light"]), model: z.string().min(1), backup: z.string().min(1).nullable() })
  .refine((t) => t.backup !== t.model, { message: "The backup must be a different model.", path: ["backup"] });

export async function listAiModels() {
  const [models, tiers] = await Promise.all([prisma.aiModel.findMany({ orderBy: { name: "asc" } }), prisma.aiTier.findMany()]);
  return {
    models: models.map((m) => ({ ...m, inputUsdPerM: Number(m.inputUsdPerM), cachedUsdPerM: Number(m.cachedUsdPerM), outputUsdPerM: Number(m.outputUsdPerM) })),
    tiers: (["heavy", "medium", "light"] as const).map((tier) => tiers.find((t) => t.tier === tier) ?? { tier, model: null, backup: null, updatedAt: null, updatedBy: null }),
  };
}

/** A name OpenAI doesn't know (or this key can't use) would fail every call: refuse it when it's added. */
async function assertOpenAiHas(name: string) {
  if (!process.env.OPENAI_API_KEY) return; // local without a key: calls use the mock provider anyway
  let res: Response;
  try {
    res = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(name)}`, { headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new AiModelSettingsError("Couldn't reach OpenAI to check the model name. Try again.", 502);
  }
  if (res.status === 404) throw new AiModelSettingsError(`OpenAI has no model called "${name}", or this API key can't use it.`, 422);
  if (!res.ok) throw new AiModelSettingsError(`OpenAI didn't confirm "${name}" (HTTP ${res.status}). Try again.`, 502);
}

const audit = (tx: Prisma.TransactionClient, actorUserId: string, action: string, entityType: string, entityId: string, metadata: object) =>
  tx.auditEvent.create({ data: { actorUserId, action, entityType, entityId, metadata: metadata as Prisma.InputJsonValue } });

/** Adds a model or updates one. A judge rank moves from the model that had it. */
export async function saveAiModel(actorUserId: string, input: z.infer<typeof ModelInput>) {
  const before = await prisma.aiModel.findUnique({ where: { name: input.name } });
  if (!before) await assertOpenAiHas(input.name);
  const data = { ...input, updatedBy: actorUserId };
  await prisma.$transaction(async (tx) => {
    if (input.judgeRank !== null) await tx.aiModel.updateMany({ where: { judgeRank: input.judgeRank, name: { not: input.name } }, data: { judgeRank: null } });
    await tx.aiModel.upsert({ where: { name: input.name }, create: data, update: data });
    await audit(tx, actorUserId, before ? "ai_model.updated" : "ai_model.added", "AiModel", input.name, { before, after: input });
  });
  forgetModelConfig();
}

export async function deleteAiModel(actorUserId: string, name: string) {
  const usedBy = await prisma.aiTier.findMany({ where: { OR: [{ model: name }, { backup: name }] } });
  if (usedBy.length) {
    throw new AiModelSettingsError(`${name} is in use (${usedBy.map((t) => `${t.tier} ${t.model === name ? "model" : "backup"}`).join(", ")}). Pick another model there first.`, 409);
  }
  await prisma.$transaction(async (tx) => {
    const before = await tx.aiModel.delete({ where: { name } }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw new AiModelSettingsError(`There's no model called ${name}.`, 422);
      throw e;
    });
    await audit(tx, actorUserId, "ai_model.deleted", "AiModel", name, { before });
  });
  forgetModelConfig();
}

export async function saveAiTier(actorUserId: string, input: z.infer<typeof TierInput>) {
  const known = await prisma.aiModel.findMany({ where: { name: { in: [input.model, input.backup].filter((m): m is string => !!m) } }, select: { name: true } });
  for (const m of [input.model, input.backup]) {
    if (m && !known.some((k) => k.name === m)) throw new AiModelSettingsError(`Add ${m} to the models list first.`, 422);
  }
  const tier = input.tier as AiTierName;
  await prisma.$transaction(async (tx) => {
    const before = await tx.aiTier.findUnique({ where: { tier } });
    const data = { model: input.model, backup: input.backup, updatedBy: actorUserId };
    await tx.aiTier.upsert({ where: { tier }, create: { tier, ...data }, update: data });
    await audit(tx, actorUserId, "ai_tier.updated", "AiTier", tier, { before, after: input });
  });
  forgetModelConfig();
}
