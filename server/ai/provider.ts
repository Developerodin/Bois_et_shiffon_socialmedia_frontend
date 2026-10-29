import { z } from "zod";
import { aiCostUsd, fallbackModel, modelFor, modelForTier, nextTier, type AiUsage, type Tier } from "@/server/ai/models";
import { prisma } from "@/server/db/prisma";

/**
 * AI provider boundary (DEC-003). OpenAI via the Responses API with strict JSON
 * schema output; `mock` when no key is configured (tests, local without a key).
 * The model comes from the task's tier (server/ai/models.ts). An answer that fails its schema or the caller's
 * `validate` check is asked again one tier up; a model that's unavailable is swapped for its backup once.
 * Every attempt is logged to AiWorkflowRun with its cost.
 */
export type AiCallContext = {
  workspaceId: string;
  brandId: string;
  agentRunId?: string;
  workflowId: string;
  promptVersion: string;
};

export type GenerateObjectInput<T extends z.ZodType> = {
  schema: T;
  schemaName: string;
  system: string;
  prompt: string;
  /** Overrides the tier's model for this one call. */
  model?: string;
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
    readonly kind?: "schema" | "unavailable",
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
  let { tier, model } = modelFor(ctx.workflowId);
  if (provider === "mock") return mockCall(ctx, input, tier);
  if (input.model) model = input.model;

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
        model = modelForTier(up);
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
      const problem = input.validate?.(parsed.data) ?? null;
      if (!problem || retried) {
        await logRun(ctx, provider, tier, model, "SUCCEEDED", started, usage, problem ? `Failed check again (kept): ${problem}` : undefined);
        if (parsed.data && typeof parsed.data === "object") answered.set(parsed.data, { model, tier });
        return parsed.data;
      }
      const [was, wasTier] = [model, tier];
      const next = retry();
      feedback = problem;
      await logRun(ctx, provider, wasTier, was, "ESCALATED", started, usage, `Failed check (${next}): ${problem}`);
    } catch (error) {
      const kind = error instanceof AiProviderError ? error.kind : undefined;
      const [was, wasTier] = [model, tier];
      if (kind === "schema" && !retried) {
        const next = retry();
        feedback = "your previous answer wasn't valid for the required JSON schema";
        await logRun(ctx, provider, wasTier, was, "ESCALATED", started, usage, `${String(error)} (${next})`);
        continue;
      }
      const backup = kind === "unavailable" && !fellBack ? fallbackModel(tier, model) : null;
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

async function callOpenAi<T extends z.ZodType>(
  ctx: AiCallContext,
  input: GenerateObjectInput<T>,
  model: string,
  feedback: string | null,
) {
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
      // A retry's reason goes last, so the long prompt start stays identical (and cacheable).
      input: feedback ? `${input.prompt}\n\n---\nYour previous answer was rejected, fix this: ${feedback}` : input.prompt,
      // Same brand + agent share a long prompt start (brand knowledge first): this keeps them on one cache.
      prompt_cache_key: `${ctx.brandId}:${ctx.workflowId.split(".")[0]}`,
      ...(input.webSearch ? { tools: [{ type: "web_search", ...(input.searchContext ? { search_context_size: input.searchContext } : {}) }] } : {}),
      ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
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
    // too long, a bad parameter) would fail on the backup the same way. Model names have dots ("gpt-6.1-terra"),
    // so the phrase may sit a few words after "model".
    const unavailable = retryable || res.status === 404 || (res.status === 400 && /\bmodel\b.{0,80}?\b(not found|does not exist|not supported|unsupported|deprecated|no access|not available)/i.test(body));
    throw new AiProviderError(`OpenAI ${res.status}: ${body}`, retryable, unavailable ? "unavailable" : undefined);
  }
  const body = (await res.json()) as {
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    usage?: {
      input_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
      output_tokens?: number;
      output_tokens_details?: { reasoning_tokens?: number };
    };
  };
  const text = body.output
    ?.flatMap((o) => o.content ?? [])
    .find((c) => c.type === "output_text")?.text;
  if (!text) throw new AiProviderError("OpenAI returned no output_text", true, "schema");
  const usage: AiUsage = {
    inputTokens: body.usage?.input_tokens,
    cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens,
    outputTokens: body.usage?.output_tokens,
    reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens,
    webSearchCalls: body.output?.filter((o) => o.type === "web_search_call").length ?? 0,
  };
  return { text, usage };
}

async function logRun(
  ctx: AiCallContext,
  provider: string,
  tier: Tier,
  model: string,
  status: string,
  started: number,
  usage?: AiUsage,
  error?: string,
) {
  await prisma.aiWorkflowRun.create({
    data: {
      workspaceId: ctx.workspaceId,
      brandId: ctx.brandId,
      agentRunId: ctx.agentRunId,
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
      costUsd: usage ? aiCostUsd(model, usage) : null,
      latencyMs: Date.now() - started,
      error: error?.slice(0, 2000),
    },
  });
}
