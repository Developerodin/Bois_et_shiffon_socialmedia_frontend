/**
 * Model routing checks (server/ai/models.ts, server/ai/provider.ts): tiers, overrides, cost, and the escalation /
 * backup paths, with OpenAI and the ledger write faked. No network, no database writes.
 * Run: npm run check:models -w web
 */
import assert from "node:assert/strict";
import { z } from "zod";
import { aiCostUsd, fallbackModel, modelFor, tierFor } from "@/server/ai/models";
import { AiProviderError, answeredBy, generateObject } from "@/server/ai/provider";
import { prisma } from "@/server/db/prisma";
import { onPage } from "@/server/research/brand-summary";

// Tiers: listed ids, whole-agent prefixes, and the medium default for anything new.
assert.equal(tierFor("research.brand-voice"), "heavy");
assert.equal(tierFor("creator.revise"), "heavy");
assert.equal(tierFor("quality.review"), "heavy");
assert.equal(tierFor("research.competitor-analysis"), "medium");
assert.equal(tierFor("research.summary"), "medium");
assert.equal(tierFor("geo.questions"), "light");
assert.equal(tierFor("geo.visibility"), "medium");
assert.equal(tierFor("systems-check.briefing"), "light");
assert.equal(tierFor("some-new-agent.task"), "medium");
assert.equal(tierFor("creatorx.draft"), "medium"); // a prefix needs its dot

// .env overrides a tier's model; empty falls back to the default.
process.env.AI_MODEL_HEAVY = "gpt-6-astra";
assert.deepEqual(modelFor("creator.draft"), { tier: "heavy", model: "gpt-6-astra" });
process.env.AI_MODEL_HEAVY = "";
assert.equal(modelFor("creator.draft").model, "gpt-6.1-sol");

// Backups are never smaller; when the backup is the model that failed, go a tier up; heavy's top has none.
assert.equal(fallbackModel("medium", "gpt-6.1-terra"), "gpt-6.1-sol");
assert.equal(fallbackModel("light", "gpt-6-luna"), "gpt-6.1-terra");
// light's backup is medium's model: skip it and go to heavy rather than retrying the model that failed.
assert.equal(fallbackModel("light", "gpt-6.1-terra"), "gpt-6.1-sol");
assert.equal(fallbackModel("heavy", "gpt-6.1-sol"), "gpt-6-sol");
assert.equal(fallbackModel("heavy", "gpt-6-sol"), null);

// Cost: cached input at the cached rate, web searches at $0.01, unknown model → null.
// gpt-6.1-terra: 10,000 in (4,000 cached) and 1,000 out, 2 searches = 0.006 + 0.0002 + 0.005 + 0.02.
assert.equal(aiCostUsd("gpt-6.1-terra", { inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 1_000, webSearchCalls: 2 })!.toFixed(6), "0.031200");
assert.equal(aiCostUsd("gpt-5-mini", {}), 0);
assert.equal(aiCostUsd("mock", { inputTokens: 5 }), null);

// The summary's tagline check: quoted from the page (case, quotes, spacing aside) or empty.
const page = { url: "https://x.fr/", title: "Accueil", description: null, text: "Bienvenue. FAIRE DE SA MAISON  sa plus belle destination. Livraison offerte." } as never;
assert.ok(onPage("Faire de sa maison sa plus belle destination.", page));
assert.ok(onPage("", page));
assert.ok(!onPage("L'Art de Vivre à la Française", page));
assert.ok(!onPage("Une phrase", undefined));

// Escalation and backups, with OpenAI answering from a script and the ledger write captured.
const logged: { model: string; tier: string; status: string; error?: string }[] = [];
(prisma.aiWorkflowRun as unknown as { create: (a: { data: never }) => Promise<unknown> }).create = async ({ data }) => (logged.push(data), {});
let script: Array<{ status?: number; text?: string; body?: string }> = [];
const asked: string[] = [];
const prompts: string[] = [];
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  asked.push(JSON.parse(init.body).model);
  prompts.push(JSON.parse(init.body).input);
  const next = script.shift()!;
  if (next.status && next.status !== 200) return new Response(next.body ?? "error", { status: next.status });
  return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: next.text }] }], usage: { input_tokens: 100, output_tokens: 10 } });
}) as typeof fetch;
process.env.OPENAI_API_KEY = "test";
const Answer = z.object({ word: z.string() });
const ctx = (workflowId: string) => ({ workspaceId: "w", brandId: "b", workflowId, promptVersion: "t" });
const run = (workflowId: string, validate?: (v: { word: string }) => string | null) =>
  generateObject(ctx(workflowId), { schema: Answer, schemaName: "a", system: "s", prompt: "p", validate });
const reset = (s: typeof script) => ((script = s), (asked.length = 0), (prompts.length = 0), (logged.length = 0));

(async () => {
  // A light answer failing its check is asked of medium, told why; medium's answer is used and attributed.
  reset([{ text: '{"word":"bad"}' }, { text: '{"word":"good"}' }]);
  const v1 = await run("geo.questions", (v) => (v.word === "good" ? null : "not good"));
  assert.equal(v1.word, "good");
  assert.deepEqual(asked, ["gpt-6-luna", "gpt-6.1-terra"]);
  assert.deepEqual(logged.map((l) => [l.status, l.model]), [["ESCALATED", "gpt-6-luna"], ["SUCCEEDED", "gpt-6.1-terra"]]);
  assert.equal(prompts[0], "p");
  assert.match(prompts[1], /^p\n\n---\nYour previous answer was rejected, fix this: not good$/); // reason last: prompt start unchanged
  assert.deepEqual(answeredBy(v1), { model: "gpt-6.1-terra", tier: "medium" });

  // Heavy has nothing above it: the same model is asked again with the reason; a second failure keeps that answer.
  reset([{ text: '{"word":"bad"}' }, { text: '{"word":"worse"}' }]);
  assert.equal((await run("creator.draft", () => "too long")).word, "worse");
  assert.deepEqual(asked, ["gpt-6.1-sol", "gpt-6.1-sol"]);
  assert.match(prompts[1], /fix this: too long/);
  assert.deepEqual(logged.map((l) => l.status), ["ESCALATED", "SUCCEEDED"]);
  assert.match(logged[1].error!, /again \(kept\)/);

  // Only one retry: medium → heavy, and if heavy also fails its check, heavy's answer is kept.
  reset([{ text: '{"word":"a"}' }, { text: '{"word":"b"}' }]);
  assert.equal((await run("research.summary", () => "no")).word, "b");
  assert.deepEqual(asked, ["gpt-6.1-terra", "gpt-6.1-sol"]);

  // A bad answer, then the bigger model is down: its backup answers (three calls, the most there can be).
  reset([{ text: '{"word":"a"}' }, { status: 503 }, { text: '{"word":"c"}' }]);
  assert.equal((await run("research.summary", (v) => (v.word === "a" ? "no" : null))).word, "c");
  assert.deepEqual(asked, ["gpt-6.1-terra", "gpt-6.1-sol", "gpt-6-sol"]);
  assert.deepEqual(logged.map((l) => l.status), ["ESCALATED", "FELL_BACK", "SUCCEEDED"]);

  // Not JSON → escalate; a second malformed answer fails the call.
  reset([{ text: "oops" }, { text: '{"nope":1}' }]);
  await assert.rejects(run("research.summary"), /failed schema/);
  assert.deepEqual(asked, ["gpt-6.1-terra", "gpt-6.1-sol"]);

  // A model that's down: one try on the backup.
  reset([{ status: 503 }, { text: '{"word":"ok"}' }]);
  assert.equal((await run("research.summary")).word, "ok");
  assert.deepEqual(asked, ["gpt-6.1-terra", "gpt-6.1-sol"]);
  assert.match(logged[0].error!, /trying gpt-6.1-sol/);

  // A retired model (404, or a 400 naming the model) also goes to the backup; two outages in a row fail the call.
  reset([{ status: 404, body: "The model does not exist" }, { status: 503 }]);
  await assert.rejects(run("research.summary"), (e: unknown) => e instanceof AiProviderError && e.retryable);
  assert.equal(asked.length, 2);
  reset([{ status: 400, body: "The model `gpt-6.1-terra` does not exist or you do not have access to it." }, { text: '{"word":"ok"}' }]);
  assert.equal((await run("research.summary")).word, "ok");

  // Other 400s would fail the same way on any model: no backup.
  reset([{ status: 400, body: "This model's maximum context length is 1050000 tokens. Your messages resulted in 2000000 tokens." }]);
  await assert.rejects(run("research.summary"), /OpenAI 400/);
  assert.equal(asked.length, 1);

  // Out of credits: no backup can help, stop at once.
  reset([{ status: 429, body: '{"error":{"code":"insufficient_quota"}}' }]);
  await assert.rejects(run("research.summary"), /credits used up/);
  assert.equal(asked.length, 1);

  console.log("✓ model tiers, overrides, cost, tagline check, escalation, backups");
})().finally(() => prisma.$disconnect());
