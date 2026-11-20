import type { ReelStep } from "./reel";

/** A reel's page, on a step when given. No runtime imports: the Overview links here without loading the reel page's code. */
export const reelHref = (id: string, brandId: string, step?: ReelStep): string => `/reels/${encodeURIComponent(id)}?b=${encodeURIComponent(brandId)}${step ? `&step=${step}` : ""}`;
