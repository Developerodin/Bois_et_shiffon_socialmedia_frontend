import "server-only";
import { notFound } from "next/navigation";

export type WebFeature =
  | "library"
  | "photoshoot"
  | "reels"
  | "stories"
  | "inbox"
  | "automations"
  | "onboarding"
  | "plans";

const list = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Read on every call so flags follow the run-time environment, not the build.
export function featureOn(feature: WebFeature, workspaceId: string | null): boolean {
  if (list("WEB_FEATURES").includes(feature)) return true;
  return workspaceId !== null && list("WEB_FEATURE_WORKSPACES").includes(`${feature}:${workspaceId}`);
}

// Feature pages call this first; an unflagged route is a 404.
export function requireFeature(feature: WebFeature, workspaceId: string | null): void {
  if (!featureOn(feature, workspaceId)) notFound();
}
