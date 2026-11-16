import { api, session } from "@/api/client";
import { currentBrand, forgetBrand, hasSavedBrand, me, NoBusiness, rememberBrand } from "@/api/endpoints";
import { clearOnboarding } from "@/ui/onboarding/state";
import { forgetPosts } from "@/ui/posts/use-posts";
import { disablePush } from "@/ui/push";
import { forgetRenders } from "@/ui/reels/render-watch";
import { openReel } from "@/ui/reels/use-reel";
import { forgetCurrentBrand, siteLabel } from "@/ui/use-current-brand";
import { forgetPlan } from "@/ui/plans/use-plan";

/** Everything the app keeps about the business it's working on: dropped on sign-out and on switching business. */
function forgetBusinessState() {
  forgetPlan();
  forgetCurrentBrand();
  forgetPosts();
  openReel(null);
  forgetRenders();
}

/** Sign out (Account M12 and the drawer M13): this phone stops getting the person's notifications and forgets their data. */
export async function signOut() {
  await disablePush();
  await session.signOut();
  clearOnboarding();
  forgetBrand();
  forgetBusinessState();
}

/**
 * A saved sign-in stopped working (expired, signed out elsewhere): the same cleanup as signing out, so the next
 * person to sign in doesn't get this one's business. Onboarding answers stay, so they continue where they were.
 * The token is already gone, so the server can't be told to drop this phone's push device; only the phone forgets
 * it (it stops counting as registered, and the in-app banner takes over).
 */
export function sessionEnded() {
  void disablePush();
  forgetBrand();
  forgetBusinessState();
}

/**
 * Where a signed-in person goes (after any sign-in, and at app start with a saved sign-in): the app if they have a
 * business, onboarding if they have none. Onboarding creates a business, so it's only chosen when the server said
 * there is none: a failed lookup (offline, a 5xx) goes to the app, whose screens retry.
 * ponytail: looks in one workspace (the saved one, else the first), like currentBrand(); a business only in another
 * workspace reads as none. Upgrade path: a "my brands" route across workspaces.
 */
export async function signedInHome(): Promise<"/posts" | "/onboarding/welcome"> {
  try {
    if (!(await hasSavedBrand())) await currentBrand();
    return "/posts";
  } catch (e) {
    return e instanceof NoBusiness ? "/onboarding/welcome" : "/posts";
  }
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
