import { z } from "zod";
import { aiCostUsd, modelFor, type AiUsage, type Tier } from "@/server/ai/models";
import { prisma } from "@/server/db/prisma";

/**
 * AI provider boundary (DEC-003). OpenAI via the Responses API with strict JSON
 * schema output; `mock` when no key is configured (tests, local without a key).
 * The model comes from the task's tier (server/ai/models.ts). Every call is logged to AiWorkflowRun with its cost.
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
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function aiProviderName(): "openai" | "mock" {
  return process.env.OPENAI_API_KEY ? "openai" : "mock";
}

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
  const routed = modelFor(ctx.workflowId);
  const model = provider === "mock" ? "mock" : (input.model ?? routed.model);
  const started = Date.now();
  let usage: AiUsage | undefined;

  try {
    const raw =
      provider === "mock"
        ? input.mock
        : await callOpenAi(input, model).then((r) => {
            usage = r.usage;
            return r.value;
          });
    if (raw === undefined) {
      throw new AiProviderError("Mock provider has no fixture for this call", false);
    }
    const parsed = input.schema.safeParse(raw);
    if (!parsed.success) {
      throw new AiProviderError(`Model output failed schema: ${parsed.error.message}`, true);
    }
    await logRun(ctx, provider, routed.tier, model, "SUCCEEDED", started, usage);
    return parsed.data;
  } catch (error) {
    await logRun(ctx, provider, routed.tier, model, "FAILED", started, usage, String(error));
    throw error;
  }
}

async function callOpenAi<T extends z.ZodType>(
  input: GenerateObjectInput<T>,
  model: string,
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
      input: input.prompt,
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
    throw new AiProviderError(`OpenAI ${res.status}: ${body}`, retryable);
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
  if (!text) throw new AiProviderError("OpenAI returned no output_text", true);
  const usage: AiUsage = {
    inputTokens: body.usage?.input_tokens,
    cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens,
    outputTokens: body.usage?.output_tokens,
    reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens,
    webSearchCalls: body.output?.filter((o) => o.type === "web_search_call").length ?? 0,
  };
  return { value: JSON.parse(text) as unknown, usage };
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
