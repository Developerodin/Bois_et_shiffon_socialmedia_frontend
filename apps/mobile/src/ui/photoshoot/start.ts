import { router } from "expo-router";
import { ApiError } from "@/api/client";
import { photoshoots, SHOOT_TIERS, type ShootRequest } from "@/api/endpoints";
import { isPlanRequired } from "@/ui/plans/use-plan";
import { openLowCredits } from "@/ui/recovery/open";

/**
 * F02/F03 Generate and F07 Variation: charges and queues the shoot, then opens F05 on it. No plan → L03 plans;
 * not enough credits → X02. Anything else is the caller's to show. `title`: what X02 says the credits were for.
 */
export async function startShoot(request: ShootRequest, title: string) {
  try {
    const { shoot } = await photoshoots.create(request);
    router.push({ pathname: "/photoshoot/generating", params: { id: shoot.id } });
  } catch (e) {
    if (isPlanRequired(e)) return router.push("/plans");
    const needed = (e instanceof ApiError && (e.data as { needed?: number } | undefined)?.needed) || SHOOT_TIERS.find((t) => t.id === request.tier)!.credits;
    if (e instanceof ApiError && e.status === 402) return openLowCredits({ needed, title });
    throw e;
  }
}
