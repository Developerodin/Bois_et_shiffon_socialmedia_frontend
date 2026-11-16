import { prisma } from "@/server/db/prisma";

/**
 * Paid outside APIs that aren't AI models, one ApiCall row per call (AI calls go to AiWorkflowRun).
 * List prices in USD per call, read 2026-10-29:
 * - Google Places (New): billed at the highest field tier asked for. Search asks for rating → Text Search Enterprise
 *   ($35 / 1,000); details ask for editorialSummary → Place Details Enterprise + Atmosphere ($25 / 1,000).
 * - PageSpeed Insights: free (quota only), recorded so the volume shows.
 * - Twilio Verify: $0.05 per approved code, plus the SMS for every send. The SMS rate depends on the country;
 *   TWILIO_SMS_USD sets it (default: Twilio's US rate).
 * ponytail: list prices; Google's free monthly allowance (1,000 Enterprise calls per SKU) isn't subtracted, so
 * small volumes show more than the bill.
 */
const PRICE_USD = {
  "google-places.search": 0.035,
  "google-places.details": 0.025,
  "google-pagespeed.run": 0,
  "twilio-verify.send": Number(process.env.TWILIO_SMS_USD ?? 0.0083),
  "twilio-verify.check": 0,
  "twilio-verify.approved": 0.05,
} as const;
export type PricedOperation = keyof typeof PRICE_USD;

export type UsageScope = { workspaceId?: string; brandId?: string; userId?: string };

/**
 * Records one call. Failed calls cost nothing unless the provider bills them; pass `billed` to say so.
 * Never throws: a ledger problem must not break a sign-in or a search (it logs instead).
 */
export async function recordApiCall(
  operation: PricedOperation,
  ok: boolean,
  started: number,
  opts: UsageScope & { billed?: PricedOperation[] } = {},
) {
  const [provider, op] = operation.split(".");
  const billed = opts.billed ?? (ok ? [operation] : []);
  try {
    await prisma.apiCall.create({
      data: {
        workspaceId: opts.workspaceId,
        brandId: opts.brandId,
        userId: opts.userId,
        provider,
        operation: op,
        status: ok ? "SUCCEEDED" : "FAILED",
        latencyMs: Date.now() - started,
        costUsd: billed.reduce((sum, o) => sum + PRICE_USD[o], 0),
      },
    });
  } catch (error) {
    console.error("[usage] couldn't record", operation, error instanceof Error ? error.message : error);
  }
}
