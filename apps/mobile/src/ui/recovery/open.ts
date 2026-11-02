import { router } from "expo-router";

/**
 * X02 "Not enough credits", over the screen that asked: what it needs, and what it was for (the faded card behind
 * the sheet). Every 402 from a paid action (render, Generate calendar) opens it.
 */
export const openLowCredits = (p: { needed: number; title: string; meta?: string; backdrop?: string }) =>
  router.push({ pathname: "/recovery/low-credits", params: { needed: String(p.needed), title: p.title, meta: p.meta ?? "", backdrop: p.backdrop ?? "" } });
