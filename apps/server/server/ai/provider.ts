import { z } from "zod";
import { modelConfig } from "@/server/ai/model-config";
import { aiCostUsd, fallbackModel, modelFor, modelForTier, nextTier, tierFor, type AiUsage, type Tier } from "@/server/ai/models";
import { grade, type Finding } from "@/server/ai/graders";
import { prisma } from "@/server/db/prisma";

/**
 * AI provider boundary (DEC-003). OpenAI via the Responses API with strict JSON
 * schema output; `mock` when no key is configured (tests, local without a key).
 * The model comes from the task's tier (server/ai/models.ts), set in Platform admin → AI models. An answer that fails its schema or the caller's
 * `validate` check is asked again one tier up; a model that's unavailable is swapped for its backup once.
 * Every attempt is logged to AiWorkflowRun with its cost.
 */
export type AiCallContext = {
  workspaceId: string;
  brandId: string;
  agentRunId?: string;
  /** Who caused the call: the chat user, or the agent run's starter. Unset for system calls. */
  userId?: string;
  workflowId: string;
  promptVersion: string;
};

export type GenerateObjectInput<T extends z.ZodType> = {
  schema: T;
  schemaName: string;
  system: string;
  prompt: string;
  /** Let the model use OpenAI's hosted web search (e.g. competitor research). */
  webSearch?: boolean;
  /** How much search material the model reads (OpenAI default: medium). "low" is faster and cheaper. */
  searchContext?: "low" | "medium" | "high";
  /** How long the model thinks before writing (OpenAI default: medium). "low" cuts the hidden reasoning tokens. */
  reasoningEffort?: "low" | "medium" | "high";
  /**
   * A cheap, deterministic check of the answer (rules, "the tagline must be on the page"). A reason string means it
   * failed: the call is asked once more one tier up, and if that fails too its answer is kept (the caller's own
   * guard and the Quality check still apply). Not run for the mock provider.
   */
  validate?: (value: z.infer<T>) => string | null;
  /** Returned verbatim by the mock provider. */
  mock?: z.infer<T>;
  /**
   * Streams the answer: called with the raw text written so far (partial JSON) as the model writes it. A retry starts
   * over, so callers treat each call as the whole text so far, not a delta. Not called by the mock provider.
   */
  onText?: (soFar: string) => void;
  /** Images the model looks at with the prompt, as data: URLs (e.g. two video frames for the reel seam check). */
  images?: string[];
};

/** Shown to people as-is (Agent Log, workspace banner); `readable()` also recognises it. */
export const OUT_OF_CREDITS = "AI credits used up: agents are paused until credits are added";

/** OpenAI says "insufficient_quota" in the error code and "no credits remaining" in the message. */
export const isOutOfCreditsText = (text: string) => /insufficient_quota|credit_balance|credits remaining/i.test(text);

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** schema: the answer was malformed (escalate). unavailable: the model couldn't answer (use the backup). */
    /** insecure: failed a security check twice (already logged: give up). */
    readonly kind?: "schema" | "unavailable" | "insecure",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function aiProviderName(): "openai" | "mock" {
  return process.env.OPENAI_API_KEY ? "openai" : "mock";
}

/** Which model and tier produced an answer (escalation and fallback can change it from the task's tier). */
const answered = new WeakMap<object, { model: string; tier: Tier }>();
export const answeredBy = (value: unknown) => (value && typeof value === "object" ? answered.get(value) : undefined);

export async function generateObject<T extends z.ZodType>(
  ctx: AiCallContext,
  input: GenerateObjectInput<T>,
): Promise<z.infer<T>> {
  const provider = aiProviderName();
  // Canned fixtures are for tests and local runs. In production a missing key must stop the agent,
  // never quietly hand people made-up drafts. AI_ALLOW_MOCK=1 opts a demo deployment in.
  if (provider === "mock" && process.env.NODE_ENV === "production" && process.env.AI_ALLOW_MOCK !== "1") {
    throw new AiProviderError("AI isn't set up on this server (OPENAI_API_KEY is missing). An admin needs to add it.", false);
  }
  if (provider === "mock") return mockCall(ctx, input, tierFor(ctx.workflowId));
  const cfg = await modelConfig();
  let { tier, model } = modelFor(cfg, ctx.workflowId);

  // At most three attempts: the first, one retry for a bad answer, one backup for an unavailable model. Statuses in
  // the ledger: SUCCEEDED, FAILED, ESCALATED (bad answer, asked again), FELL_BACK (model unavailable, backup tried).
  // The run's time grows with retries (a web-search call can take ~60 s); the job lease renewal covers that.
  let retried = false;
  let fellBack = false;
  let feedback: string | null = null;
  for (;;) {
    const started = Date.now();
    let usage: AiUsage | undefined;
    // A bad answer is asked again one tier up, or of the same model when it's already the top tier. Either way the
    // retry is told what was wrong: for rule breaks ("caption too long") that's what fixes it.
    const retry = (): string => {
      retried = true;
      const up = nextTier(tier);
      if (up) {
        tier = up;
        model = modelForTier(cfg, up);
        return `asking ${up}`;
      }
      return `asking ${model} again`;
    };
    try {
      const out = await callOpenAi(ctx, input, model, feedback);
      usage = out.usage;
      let json: unknown;
      try {
        json = JSON.parse(out.text);
      } catch {
        throw new AiProviderError(`Model output wasn't JSON: ${out.text.slice(0, 200)}`, true, "schema");
      }
      const parsed = input.schema.safeParse(json);
      if (!parsed.success) throw new AiProviderError(`Model output failed schema: ${parsed.error.message}`, true, "schema");
      // Online eval (server/ai/graders.ts) on every answer, plus the caller's own check. Security findings count as a
      // failed check (asked again with the reason); the rest are recorded for the report.
      const findings = grade({ workflowId: ctx.workflowId, system: input.system, prompt: input.prompt, webSearch: !!input.webSearch, output: parsed.data });
      const own = input.validate?.(parsed.data) ?? null;
      if (own) findings.push({ check: "Task check", note: own });
      const insecure = findings.filter((f) => f.security).map((f) => `${f.check}: ${f.note}`).join("; ");
      const problem = [own, insecure].filter(Boolean).join("; ") || null;
      // Asked again and still a security problem (a link it shouldn't write, its instructions repeated): don't hand
      // that answer on. A rule break is kept instead (Quality and the approver see it), but this could reach a
      // customer or be copied into the brand's documents unseen.
      if (retried && insecure) {
        await logRun(ctx, provider, tier, model, "FAILED", started, usage, `Failed a security check again: ${insecure}`, findings);
        throw new AiProviderError(`The AI's answer failed a security check twice, so it wasn't used (${insecure.slice(0, 200)})`, false, "insecure");
      }
      if (!problem || retried) {
        await logRun(ctx, provider, tier, model, "SUCCEEDED", started, usage, problem ? `Failed check again (kept): ${problem}` : undefined, findings);
        if (parsed.data && typeof parsed.data === "object") answered.set(parsed.data, { model, tier });
        return parsed.data;
      }
      const [was, wasTier] = [model, tier];
      const next = retry();
      feedback = problem;
      await logRun(ctx, provider, wasTier, was, "ESCALATED", started, usage, `Failed check (${next}): ${problem}`, findings);
    } catch (error) {
      const kind = error instanceof AiProviderError ? error.kind : undefined;
      if (kind === "insecure") throw error;
      const [was, wasTier] = [model, tier];
      if (kind === "schema" && !retried) {
        const next = retry();
        feedback = "your previous answer wasn't valid for the required JSON schema";
        await logRun(ctx, provider, wasTier, was, "ESCALATED", started, usage, `${String(error)} (${next})`);
        continue;
      }
      const backup = kind === "unavailable" && !fellBack ? fallbackModel(cfg, tier, model) : null;
      await logRun(ctx, provider, wasTier, was, backup ? "FELL_BACK" : "FAILED", started, usage, `${String(error)}${backup ? ` (trying ${backup})` : ""}`);
      if (!backup) throw error;
      model = backup;
      fellBack = true;
    }
  }
}

async function mockCall<T extends z.ZodType>(ctx: AiCallContext, input: GenerateObjectInput<T>, tier: Tier): Promise<z.infer<T>> {
  const started = Date.now();
  try {
    if (input.mock === undefined) throw new AiProviderError("Mock provider has no fixture for this call", false);
    const parsed = input.schema.safeParse(input.mock);
    if (!parsed.success) throw new AiProviderError(`Model output failed schema: ${parsed.error.message}`, true);
    await logRun(ctx, "mock", tier, "mock", "SUCCEEDED", started);
    if (parsed.data && typeof parsed.data === "object") answered.set(parsed.data, { model: "mock", tier });
    return parsed.data;
  } catch (error) {
    await logRun(ctx, "mock", tier, "mock", "FAILED", started, undefined, String(error));
    throw error;
  }
}

/** One raw call, no retries or ledger row: generateObject adds those. Exported for the test set (scripts/evals). */
export async function callOpenAi<T extends z.ZodType>(
  ctx: AiCallContext,
  input: GenerateObjectInput<T>,
  model: string,
  feedback: string | null,
) {
  // GPT-5.6 and later cache only at marked points (breakpoints), not any shared start. Our prompts put what several
  // calls share first (brand knowledge, website pages) and end it with "\n\n---\n". The last such line is marked (the
  // material before it may hold its own "---"; the task after it is JSON, which has none), so the next call with the
  // same start reads it at 5–10% of the input price. Explicit mode: a prompt with no such line isn't written to the
  // cache, since a write costs 1.25× input and nobody would read it back.
  // Measured 2026-10-29 on the medium tier's model: same 5,100-token start, different ending: 0 cached without a
  // breakpoint, 5,122 with one. Models without this ("Cache breakpoints" off in Platform admin → AI models; OpenAI's before
  // GPT-5.6) get the prompt as one string.
  const retryNote = feedback ? `\n\n---\nYour previous answer was rejected, fix this: ${feedback}` : "";
  const prompt = input.prompt + retryNote;
  const cut = input.prompt.lastIndexOf("\n\n---\n") + 2;
  const parts = [
    ...(cut > 1 ? [{ type: "input_text", text: input.prompt.slice(0, cut), prompt_cache_breakpoint: { mode: "explicit" } }] : []),
    { type: "input_text", text: input.prompt.slice(cut > 1 ? cut : 0) + retryNote },
  ];
  const breakpoints = (await modelConfig()).models.get(model)?.cacheBreakpoints ?? false;
  const images = (input.images ?? []).map((url) => ({ type: "input_image", image_url: url }));
  // ponytail: one call can include web search; 2.5 min covers slow ones without holding the runner forever.
  const res = await fetch("https://api.openai.com/v1/responses", {
    signal: AbortSignal.timeout(150_000),
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: input.system,
      // A retry's reason goes last, so the prompt before it is still a cached start.
      input: breakpoints || images.length ? [{ role: "user", content: [...(breakpoints ? parts : [{ type: "input_text", text: prompt }]), ...images] }] : prompt,
      ...(breakpoints ? { prompt_cache_options: { mode: "explicit" } } : {}),
      // Same brand + agent share a prompt start: this keeps them on one cache (routing; no guarantee of a hit).
      prompt_cache_key: `${ctx.brandId}:${ctx.workflowId.split(".")[0]}`,
      ...(input.webSearch ? { tools: [{ type: "web_search", ...(input.searchContext ? { search_context_size: input.searchContext } : {}) }] } : {}),
      ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
      ...(input.onText ? { stream: true } : {}),
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: z.toJSONSchema(input.schema, { target: "draft-7" }),
        },
      },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    // An empty credit balance is also a 429, but waiting won't fix it: stop now, don't retry for hours.
    if (isOutOfCreditsText(body)) throw new AiProviderError(OUT_OF_CREDITS, false);
    const retryable = res.status === 429 || res.status >= 500;
    // A retired or unknown model won't come back by waiting: use the backup. Narrow on purpose: other 400s (a prompt
    // too long, a bad parameter) would fail on the backup the same way. Model names can have dots ("x-6.1-y"),
    // so the phrase may sit a few words after "model".
    const unavailable = retryable || res.status === 404 || (res.status === 400 && /\bmodel\b.{0,80}?\b(not found|does not exist|not supported|unsupported|deprecated|no access|not available)/i.test(body));
    throw new AiProviderError(`OpenAI ${res.status}: ${body}`, retryable, unavailable ? "unavailable" : undefined);
  }
  const body = (input.onText ? await readStream(res, input.onText) : await res.json()) as ResponseBody;
  const text = body.output
    ?.flatMap((o) => o.content ?? [])
    .find((c) => c.type === "output_text")?.text;
  if (!text) throw new AiProviderError("OpenAI returned no output_text", true, "schema");
  const usage: AiUsage = {
    inputTokens: body.usage?.input_tokens,
    cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens,
    cacheWriteTokens: body.usage?.input_tokens_details?.cache_write_tokens,
    outputTokens: body.usage?.output_tokens,
    reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens,
    webSearchCalls: body.output?.filter((o) => o.type === "web_search_call").length ?? 0,
  };
  return { text, usage };
}

type ResponseBody = {
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  usage?: {
    input_tokens?: number;
    input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
};

/**
 * A streamed Responses call (server-sent events): hands on the text as it grows, and returns the finished response
 * (`response.completed` carries the same output and usage as a plain call).
 */
async function readStream(res: Response, onText: (soFar: string) => void): Promise<ResponseBody> {
  if (!res.body) throw new AiProviderError("OpenAI sent no stream", true, "unavailable");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
      const data = buffer.slice(0, end).split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      buffer = buffer.slice(end + 2);
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data) as { type: string; delta?: string; response?: ResponseBody };
      if (event.type === "response.output_text.delta" && event.delta) onText((text += event.delta));
      else if (event.type === "response.completed" && event.response) return event.response;
      else if (event.type === "response.failed" || event.type === "error") throw new AiProviderError(`OpenAI stream failed: ${data.slice(0, 300)}`, true, "unavailable");
    }
  }
  throw new AiProviderError("OpenAI's stream ended before the answer was complete", true, "unavailable");
}

export async function logRun(
  ctx: AiCallContext,
  provider: string,
  /** "eval" for the test set's own calls (scripts/evals). */
  tier: Tier | "eval",
  model: string,
  status: string,
  started: number,
  usage?: AiUsage,
  error?: string,
  /** Online eval of an answer; undefined when there was no answer to grade (an error, or the mock). */
  findings?: Finding[],
) {
  await prisma.aiWorkflowRun.create({
    data: {
      workspaceId: ctx.workspaceId,
      brandId: ctx.brandId,
      agentRunId: ctx.agentRunId,
      userId: ctx.userId,
      workflowId: ctx.workflowId,
      promptVersion: ctx.promptVersion,
      provider,
      tier,
      model,
      status,
      inputTokens: usage?.inputTokens,
      cachedInputTokens: usage?.cachedInputTokens,
      outputTokens: usage?.outputTokens,
      reasoningTokens: usage?.reasoningTokens,
      webSearchCalls: usage?.webSearchCalls,
      costUsd: usage ? aiCostUsd(await modelConfig(), model, usage) : null,
      latencyMs: Date.now() - started,
      error: error?.slice(0, 2000),
      evalPassed: findings ? findings.length === 0 : null,
      evalFindings: findings?.length ? findings.map((f) => ({ ...f, note: f.note.slice(0, 300) })) : undefined,
    },
  });
}
