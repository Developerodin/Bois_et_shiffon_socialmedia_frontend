/**
 * What we've spent: AI calls by model, tier and task, and other paid APIs, in USD and INR. Read-only.
 * Run: npm run usage -w web [-- --days 30]   (default: everything recorded)
 * INR uses USD_INR from .env when set, else today's rate from open.er-api.com.
 * ponytail: loads every row in the period into memory; fine to ~100k calls, then aggregate in SQL (groupBy) instead.
 * Rows from before 2026-10-29 have tokens but no stored cost: they're priced from their tokens at today's list price,
 * without web searches (those weren't counted then). Rows for deleted brands before that date are gone.
 */
import { aiCostUsd } from "@/server/ai/models";
import { prisma } from "@/server/db/prisma";

const daysArg = process.argv.indexOf("--days");
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : null;
const since = days ? new Date(Date.now() - days * 86_400_000) : new Date(0);

async function inrRate(): Promise<{ rate: number; from: string } | null> {
  if (process.env.USD_INR) return { rate: Number(process.env.USD_INR), from: "USD_INR in .env" };
  try {
    const body = (await (await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) })).json()) as { rates?: { INR?: number }; time_last_update_utc?: string };
    return body.rates?.INR ? { rate: body.rates.INR, from: `open.er-api.com, ${body.time_last_update_utc}` } : null;
  } catch {
    return null;
  }
}

type Row = { key: string; calls: number; failed: number; input: number; output: number; searches: number; usd: number };
const add = (m: Map<string, Row>, key: string, r: Omit<Row, "key">) => {
  const e = m.get(key) ?? { key, calls: 0, failed: 0, input: 0, output: 0, searches: 0, usd: 0 };
  for (const k of ["calls", "failed", "input", "output", "searches", "usd"] as const) e[k] += r[k];
  m.set(key, e);
};

(async () => {
  const [ai, api, fx] = await Promise.all([
    prisma.aiWorkflowRun.findMany({ where: { createdAt: { gte: since } }, select: { model: true, tier: true, workflowId: true, status: true, inputTokens: true, cachedInputTokens: true, outputTokens: true, webSearchCalls: true, costUsd: true, error: true, createdAt: true } }),
    prisma.apiCall.findMany({ where: { createdAt: { gte: since } }, select: { provider: true, operation: true, status: true, costUsd: true } }),
    inrRate(),
  ]);
  const money = (usd: number) => `$${usd.toFixed(4)}${fx ? `  ₹${(usd * fx.rate).toFixed(2)}` : ""}`;
  const table = (title: string, m: Map<string, Row>, tokens = true) => {
    console.log(`\n${title}`);
    for (const r of [...m.values()].sort((a, b) => b.usd - a.usd)) {
      console.log(`  ${r.key.padEnd(32)} ${String(r.calls).padStart(5)} calls${r.failed ? ` (${r.failed} failed)` : ""}${tokens ? `  ${String(r.input).padStart(9)} in ${String(r.output).padStart(8)} out  ${r.searches} searches` : ""}  ${money(r.usd)}`);
    }
  };

  const byModel = new Map<string, Row>(), byTier = new Map<string, Row>(), byTask = new Map<string, Row>(), byApi = new Map<string, Row>();
  let aiUsd = 0, unpriced = 0;
  for (const r of ai) {
    const usd = r.costUsd !== null ? Number(r.costUsd) : (aiCostUsd(r.model, { inputTokens: r.inputTokens ?? 0, cachedInputTokens: r.cachedInputTokens ?? 0, outputTokens: r.outputTokens ?? 0 }) ?? 0);
    if (r.costUsd === null && r.model !== "mock") unpriced++;
    aiUsd += usd;
    const row = { calls: 1, failed: r.status === "FAILED" ? 1 : 0, input: r.inputTokens ?? 0, output: r.outputTokens ?? 0, searches: r.webSearchCalls ?? 0, usd };
    add(byModel, r.model, row);
    add(byTier, r.tier ?? "(before routing)", row);
    add(byTask, r.workflowId, row);
  }
  let apiUsd = 0;
  for (const r of api) {
    const usd = Number(r.costUsd ?? 0);
    apiUsd += usd;
    add(byApi, `${r.provider} ${r.operation}`, { calls: 1, failed: r.status === "FAILED" ? 1 : 0, input: 0, output: 0, searches: 0, usd });
  }

  console.log(`Usage ${days ? `for the last ${days} days` : "since records began"} (${ai[0] ? ai.reduce((a, r) => (r.createdAt < a ? r.createdAt : a), ai[0].createdAt).toISOString().slice(0, 10) : "-"} →)`);
  console.log(fx ? `1 USD = ₹${fx.rate.toFixed(2)} (${fx.from})` : "No INR rate available: USD only (set USD_INR in .env)");
  table("AI by model", byModel);
  table("AI by tier", byTier);
  table("AI by task", byTask);
  table("Other APIs", byApi, false);

  // Routing health: answers asked again (failed a check or the schema), backups used, share of input from cache.
  const escalated = ai.filter((r) => r.status === "ESCALATED").length;
  const fellBack = ai.filter((r) => r.status === "FELL_BACK").length;
  console.log(`\nRouting  ${escalated} answers asked again (failed a check or the schema), ${fellBack} switched to a backup model`);
  for (const m of [...byModel.keys()]) {
    const rows = ai.filter((r) => r.model === m && r.cachedInputTokens !== null);
    const input = rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
    if (input) console.log(`  ${m.padEnd(32)} ${Math.round((100 * rows.reduce((s, r) => s + (r.cachedInputTokens ?? 0), 0)) / input)}% of input from cache`);
  }

  // Quality signal (Cursor's "keep rate" for us): what approvers decided on drafts, by the model that wrote them.
  const decisions = await prisma.approvalDecision.findMany({ where: { createdAt: { gte: since } }, select: { verdict: true, contentVersionId: true } });
  const versions = await prisma.contentVersion.findMany({ where: { id: { in: [...new Set(decisions.map((d) => d.contentVersionId))] } }, select: { id: true, model: true, createdBy: true } });
  const writer = new Map(versions.map((v) => [v.id, v.createdBy === "agent" ? (v.model ?? "AI (model not recorded)") : "edited by a person"]));
  const verdicts = new Map<string, Record<string, number>>();
  for (const d of decisions) {
    const w = writer.get(d.contentVersionId) ?? "unknown";
    const v = verdicts.get(w) ?? { APPROVED: 0, CHANGES_REQUESTED: 0, REJECTED: 0 };
    v[d.verdict]++;
    verdicts.set(w, v);
  }
  console.log("\nApprovals by who wrote the draft");
  if (!verdicts.size) console.log("  no approval decisions yet");
  for (const [w, v] of verdicts) {
    const total = v.APPROVED + v.CHANGES_REQUESTED + v.REJECTED;
    console.log(`  ${w.padEnd(32)} ${String(total).padStart(4)} decisions  ${Math.round((100 * v.APPROVED) / total)}% approved  (${v.CHANGES_REQUESTED} changes requested, ${v.REJECTED} rejected)`);
  }
  console.log(`\nTotal  AI ${money(aiUsd)}   APIs ${money(apiUsd)}   All ${money(aiUsd + apiUsd)}`);
  if (unpriced) console.log(`(${unpriced} older AI calls priced from tokens at today's list price; their web searches weren't recorded)`);
  console.log("List prices: OpenAI's bill can be lower (cached input before 2026-10-29, free Google allowances). The OpenAI dashboard has the exact bill.");
})().finally(() => prisma.$disconnect());
