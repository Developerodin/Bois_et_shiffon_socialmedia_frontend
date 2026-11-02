import { api, session } from "@/api/client";
import { forgetBrand, me, rememberBrand } from "@/api/endpoints";
import { clearOnboarding } from "@/ui/onboarding/state";
import { forgetPosts } from "@/ui/posts/use-posts";
import { disablePush } from "@/ui/push";
import { openReel } from "@/ui/reels/use-reel";
import { forgetCurrentBrand, siteLabel } from "@/ui/use-current-brand";
import { forgetPlan } from "@/ui/plans/use-plan";

/** Everything the app keeps about the business it's working on: dropped on sign-out and on switching business. */
function forgetBusinessState() {
  forgetPlan();
  forgetCurrentBrand();
  forgetPosts();
  openReel(null);
}

/** Sign out (Account M12 and the drawer M13): this phone stops getting the person's notifications and forgets their data. */
export async function signOut() {
  await disablePush();
  await session.signOut();
  clearOnboarding();
  forgetBrand();
  forgetBusinessState();
}

export type Business = { workspaceId: string; brandId: string; name: string; createdAt: string; site: string | null };

/**
 * Every business this person can open, across their workspaces, newest first.
 * ponytail: one brands request per workspace; a single "my brands" route if people join many workspaces.
 */
export async function myBusinesses(): Promise<Business[]> {
  const { workspaces } = await me();
  const lists = await Promise.all(
    workspaces.map((w) =>
      api<{ brands: { id: string; displayName: string; createdAt: string; websiteUrl?: string | null }[] }>(`/workspaces/${encodeURIComponent(w.id)}/brands`, { workspaceId: w.id }).then(
        (r) => r.brands.map((b) => ({ workspaceId: w.id, brandId: b.id, name: b.displayName, createdAt: b.createdAt, site: siteLabel(b.websiteUrl) })),
        () => [],
      ),
    ),
  );
  return lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The drawer's business switcher: every screen reads the new business from here on (it's remembered on this phone). */
export function switchBusiness(b: Business) {
  rememberBrand({ workspaceId: b.workspaceId, brandId: b.brandId, name: b.name });
  forgetBusinessState();
}
