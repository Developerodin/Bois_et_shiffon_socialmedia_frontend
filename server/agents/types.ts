import type { AgentEventLevel, Prisma } from "@prisma/client";
import type { z } from "zod";
import type { BrandContext } from "@/server/agents/brand-context";
import type { GenerateObjectInput } from "@/server/ai/provider";

/**
 * Agent = registered capability that creates drafts/records only (design §4.2).
 * Nothing here may publish, reply or spend — external side effects go through
 * the approval gate + publication package, never through an agent.
 */
export type AgentContext = {
  runId: string;
  brand: BrandContext;
  /** The run's paid charge, if any (billing bookkeeping, never agent input): a story writer refunds it when nothing was saved. */
  chargeId?: string;
  log: (
    level: AgentEventLevel,
    message: string,
    entity?: { type: string; id: string },
    data?: Prisma.InputJsonValue,
  ) => Promise<void>;
  ai: {
    generateObject: <T extends z.ZodType>(
      input: GenerateObjectInput<T> & { workflowId: string; promptVersion: string },
    ) => Promise<z.infer<T>>;
  };
};

export type AgentDefinition<I extends z.ZodType = z.ZodType> = {
  key: string;
  name: string;
  description: string;
  inputSchema: I;
  /** Cron-like hint for the daily sweep; only "daily" is supported today. */
  schedule?: "daily";
  /** Started only by its own feature (e.g. a paid competitor audit), never from the agents list or Run button. */
  internal?: boolean;
  run: (ctx: AgentContext, input: z.infer<I>) => Promise<Prisma.InputJsonValue | void>;
};
