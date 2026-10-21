import { z } from "zod";
import { prisma } from "@/server/db/prisma";

/**
 * AI provider boundary (DEC-003). OpenAI via the Responses API with strict JSON
 * schema output; `mock` when no key is configured (tests, local without a key).
 * Every call is logged to AiWorkflowRun.
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
  model?: string;
  /** Let the model use OpenAI's hosted web search (e.g. competitor research). */
  webSearch?: boolean;
  /** Returned verbatim by the mock provider. */
  mock?: z.infer<T>;
};

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

const DEFAULT_MODEL = process.env.OPENAI_MODEL_DEFAULT ?? "gpt-5-mini";

export async function generateObject<T extends z.ZodType>(
  ctx: AiCallContext,
  input: GenerateObjectInput<T>,
): Promise<z.infer<T>> {
  const provider = aiProviderName();
  const model = provider === "mock" ? "mock" : (input.model ?? DEFAULT_MODEL);
  const started = Date.now();
  let usage: { input_tokens?: number; output_tokens?: number } | undefined;

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
    await logRun(ctx, provider, model, "SUCCEEDED", started, usage);
    return parsed.data;
  } catch (error) {
    await logRun(ctx, provider, model, "FAILED", started, usage, String(error));
    throw error;
  }
}

async function callOpenAi<T extends z.ZodType>(
  input: GenerateObjectInput<T>,
  model: string,
) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: input.system,
      input: input.prompt,
      ...(input.webSearch ? { tools: [{ type: "web_search" }] } : {}),
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
    const retryable = res.status === 429 || res.status >= 500;
    throw new AiProviderError(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`, retryable);
  }
  const body = (await res.json()) as {
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = body.output
    ?.flatMap((o) => o.content ?? [])
    .find((c) => c.type === "output_text")?.text;
  if (!text) throw new AiProviderError("OpenAI returned no output_text", true);
  return { value: JSON.parse(text) as unknown, usage: body.usage };
}

async function logRun(
  ctx: AiCallContext,
  provider: string,
  model: string,
  status: string,
  started: number,
  usage?: { input_tokens?: number; output_tokens?: number },
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
      model,
      status,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs: Date.now() - started,
      error: error?.slice(0, 2000),
    },
  });
}
