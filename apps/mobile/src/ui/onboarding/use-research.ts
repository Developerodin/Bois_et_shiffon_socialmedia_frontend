import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/api/client";
import { agentEvents, contextDocs, createBrand, me } from "@/api/endpoints";
import i18n from "@/i18n";
import { onboarding } from "@/ui/onboarding/state";

/** 0 = opening website, 1 = reading brand identity, 2 = gathering photos, 3 = finished. */
export type ResearchProgress = { step: number; failed: string | null; retry: () => void };

const POLL_MS = 2500;

/**
 * Creates the brand from the website (server starts Research + SEO + GEO) and follows the Research run:
 * any page-read event → step 1; all five strategy docs drafted (Research then collects logo, colours and
 * photos) → step 2; run SUCCEEDED → done.
 * Without a website (A07) the brand is made from onboarding.business and Research finds it online.
 * ponytail: polling every 2.5s while the screen is open; switch to server-sent events if it ever matters.
 */
/** What the brand is made from: the website, the picked Maps listing, or the owner's description. */
const sourceKey = (site: string | undefined) =>
  site ?? (onboarding.place ? `place:${onboarding.place.id}` : JSON.stringify(onboarding.business));

export function useResearch(site: string | undefined): ResearchProgress {
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(ws: string, brandId: string, runId: string) {
      try {
        const [docs, ev] = await Promise.all([contextDocs(ws, brandId, ctrl.signal), agentEvents(ws, brandId, null, ctrl.signal)]);
        const run = docs.research?.runId === runId ? docs.research : null;
        const drafted = docs.docs.filter((d) => d.latest).length;
        const read = ev.events.some((e) => e.runId === runId);
        if (run?.status === "FAILED") return setFailed(run.error ?? i18n.t("onboarding:learning.errors.stopped"));
        setStep(run?.status === "SUCCEEDED" ? 3 : drafted >= 5 ? 2 : read || run?.status === "RUNNING" ? 1 : 0);
        if (run?.status !== "SUCCEEDED") timer = setTimeout(() => void poll(ws, brandId, runId), POLL_MS);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        // A network blip shouldn't end onboarding: keep polling.
        timer = setTimeout(() => void poll(ws, brandId, runId), POLL_MS * 2);
        if (e instanceof ApiError && e.status === 401) router.replace("/onboarding/sign-in");
      }
    }

    async function start() {
      try {
        let ws = onboarding.workspaceId;
        let brandId = onboarding.brandId;
        let runId = onboarding.researchRunId;
        const { business, place } = onboarding;
        const from = sourceKey(site);
        if (!ws || !brandId || !runId || onboarding.brandFrom !== from) {
          // Only once per site: going back and forth must not create a second brand.
          if (started.current) return;
          started.current = true;
          const { workspaces } = await me();
          ws = (workspaces.find((w) => w.role === "OWNER") ?? workspaces[0])?.id;
          if (!ws) return setFailed(i18n.t("onboarding:learning.errors.noWorkspace"));
          const created = await createBrand(
            ws,
            site
              ? { websiteUrl: site, goal: onboarding.goal } // the server names it the way the site names itself
              : place
                ? { placeId: place.id, language: i18n.language, goal: onboarding.goal } // name, website, address from the listing
                : { displayName: business!.name, about: business!.sells, location: business!.location, goal: onboarding.goal },
          );
          Object.assign(onboarding, { workspaceId: ws, brandId: created.brand.id, researchRunId: created.researchRunId, brandFrom: from });
          brandId = created.brand.id;
          runId = created.researchRunId;
        }
        void poll(ws, brandId!, runId!);
      } catch (e) {
        // Nothing was created (e.g. the daily brand limit): let "Try again" create it again.
        started.current = false;
        if (e instanceof ApiError && e.status === 401) return router.replace("/onboarding/sign-in");
        setFailed(e instanceof ApiError ? e.message : i18n.t("onboarding:learning.errors.startFailed"));
      }
    }

    void start();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [site, attempt]);

  async function retry() {
    setFailed(null);
    setStep(0);
    const { workspaceId: ws, brandId } = onboarding;
    // Restart Research only for the brand made from what's on screen now. A brand saved from an earlier onboarding
    // (or none, when creating failed) means creating again, never re-running someone else's Research.
    if (ws && brandId && onboarding.brandFrom === sourceKey(site)) {
      try {
        const { run } = await api<{ run: { id: string } }>(`/workspaces/${ws}/brands/${brandId}/agents/research/runs`, { body: {}, workspaceId: ws });
        onboarding.researchRunId = run.id;
      } catch (e) {
        return setFailed(e instanceof ApiError ? e.message : i18n.t("onboarding:learning.errors.restartFailed"));
      }
    }
    setAttempt((a) => a + 1);
  }

  return { step, failed, retry };
}
