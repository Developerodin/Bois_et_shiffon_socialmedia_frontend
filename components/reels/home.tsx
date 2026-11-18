"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReelTemplateOption } from "@/shared";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { useBrandLook } from "@/components/library/use-brand-look";
import { usePlan } from "@/components/shell/use-plan-credits";
import { fetchShared } from "@/components/workspace/use-job";
import type { Opportunity } from "@/components/workspace/content-panels";
import { openPaywall } from "@/lib/paywall";
import { navFor } from "@/lib/nav";
import { reelsUrl } from "./api";
import { PLAN_REFUSAL, TEMPLATE_LABELS, presenterState } from "./labels";
import { TOO_LONG, type CreateBody } from "./plan-stream";
import { starters } from "./reel";
import { StartCard } from "./start-card";
import { useReelIdeas, useReelOptions } from "./use-reels";
import { useReelStream } from "./use-reel-stream";
import { YourReels } from "./your-reels";

const IdeasDialog = dynamic(() => import("./ideas-dialog").then((m) => m.IdeasDialog), { ssr: false });

/**
 * The reels home: plan a new reel (from a prompt, an idea or a template), the brand's presenters and templates, and
 * its reels. A plan streams here and opens the reel's Plan step once it is saved.
 */
export function ReelsHome({ workspaceId, brandId, canCreate }: { workspaceId: string; brandId: string; canCreate: boolean }) {
  const router = useRouter();
  const { stage, draft, sending, error, create } = useReelStream(workspaceId, brandId);
  const { data: ideas, reload: reloadIdeas } = useReelIdeas(workspaceId, brandId);
  const { view } = useBrandLook(workspaceId, brandId);
  const { loaded, planned } = usePlan(workspaceId);
  const locked = loaded && !planned;
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [ideasMounted, setIdeasMounted] = useState(false);

  const productTitles = useMemo(() => (view?.assets?.products ?? []).map((p) => p.title), [view]);
  const starterList = useMemo(() => starters(ideas ?? [], productTitles), [ideas, productTitles]);

  // The plan may still land after the wait ran out: read the list again so it shows there when it does.
  useEffect(() => {
    if (error === TOO_LONG) void fetchShared(reelsUrl(workspaceId, brandId), true).catch(() => undefined);
  }, [error, workspaceId, brandId]);

  async function start(body: CreateBody) {
    // No plan: the paywall says why, and nothing is sent (the server would refuse it anyway).
    if (locked) {
      openPaywall(PLAN_REFUSAL);
      return;
    }
    const id = await create(body);
    if (body.opportunityId) void reloadIdeas();
    if (id) router.push(`/reels/${encodeURIComponent(id)}?step=plan&b=${encodeURIComponent(brandId)}`);
  }

  function pickIdea(idea: Opportunity) {
    setIdeasOpen(false);
    void start({ opportunityId: idea.id, prompt: idea.title });
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={navFor("/reels").title}>Plan, make and post short videos for your business.</PageHeader>

      {locked ? (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Reels need a plan. You can look around; planning and making videos are locked.
        </p>
      ) : null}
      {canCreate ? null : <p className="text-sm text-muted-foreground">Your role can view reels but not make them.</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {canCreate ? (
          <StartCard
            starters={starterList}
            ideaCount={ideas?.length ?? 0}
            onViewIdeas={() => {
              setIdeasMounted(true);
              setIdeasOpen(true);
            }}
            onStart={(b) => void start(b)}
            sending={sending}
            stage={stage}
            draft={draft}
            error={error}
          />
        ) : null}
        <SideColumn workspaceId={workspaceId} brandId={brandId} canCreate={canCreate} sending={sending} onUse={(templateId) => void start({ templateId })} />
      </div>

      <YourReels workspaceId={workspaceId} brandId={brandId} />

      {ideasMounted ? <IdeasDialog open={ideasOpen} onOpenChange={setIdeasOpen} ideas={ideas ?? []} disabled={sending} onUse={pickIdea} /> : null}
    </div>
  );
}

/** Presenters (read only here) and templates, each with Preview and, for a role that can, Use. */
function SideColumn({ workspaceId, brandId, canCreate, sending, onUse }: {
  workspaceId: string;
  brandId: string;
  canCreate: boolean;
  sending: boolean;
  onUse: (templateId: string) => void;
}) {
  const { data } = useReelOptions(workspaceId, brandId);
  // One preview video at a time: Preview on another template swaps this one back to its poster.
  const [playing, setPlaying] = useState<string | null>(null);
  const presenters = data?.presenters ?? [];
  const templates = data?.templates ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageSection id="presenters" title="Presenters" description={data && presenters.length === 0 ? "No presenters yet." : undefined}>
        {presenters.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {presenters.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">{presenterState(p, data?.presenterCredits ?? 0)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </PageSection>

      <PageSection id="templates" title="Templates">
        {templates.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3">
            {templates.map((t) => (
              <li key={t.id}>
                <TemplateCard template={t} playing={playing === t.id} onPreview={() => setPlaying(t.id)} canUse={canCreate} disabled={sending} onUse={() => onUse(t.id)} />
              </li>
            ))}
          </ul>
        ) : null}
      </PageSection>
    </div>
  );
}

function TemplateCard({ template, playing, onPreview, canUse, disabled, onUse }: {
  template: ReelTemplateOption;
  playing: boolean;
  onPreview: () => void;
  canUse: boolean;
  disabled: boolean;
  onUse: () => void;
}) {
  const label = TEMPLATE_LABELS[template.id] ?? { title: template.id, subtitle: "" };
  const preview = template.preview;
  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[4/5] overflow-hidden rounded-xl bg-muted">
        {preview && playing ? (
          <video src={preview.videoUrl} poster={preview.posterUrl} controls preload="none" className="size-full object-contain" aria-label={`${label.title} preview`} />
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed
          <img src={preview.posterUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        ) : null}
      </div>
      <div>
        <p className="text-sm font-medium">{label.title}</p>
        {label.subtitle ? <p className="text-xs text-muted-foreground">{label.subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {preview && !playing ? (
          <Button type="button" variant="ghost" size="sm" onClick={onPreview} aria-label={`Preview ${label.title}`}>
            Preview
          </Button>
        ) : null}
        {canUse ? (
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onUse} aria-label={`Use ${label.title}`}>
            Use
          </Button>
        ) : null}
      </div>
    </div>
  );
}
