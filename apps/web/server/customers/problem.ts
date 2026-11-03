import { problemResponse } from "@/server/api/http-error";
import { ProviderError } from "@/server/integrations/providers";
import { toReelProblem } from "@/server/reels/service";
import { ReconnectNeeded } from "@/server/services/connections";

/** Route error → problem response for the Customers and Google Growth routes. Platform text stays in the logs. */
export function toCustomersProblem(error: unknown) {
  const p = (status: number, title: string) => problemResponse({ type: "https://api.brandpilot/errors/customers", title, status, detail: title });
  if (error instanceof ReconnectNeeded) return p(409, `${error.message}. Reconnect it in Business → Connections.`);
  if (error instanceof ProviderError) {
    console.error("[customers]", error.message);
    return p(502, "The platform didn't answer. Try again in a moment.");
  }
  return toReelProblem(error);
}
