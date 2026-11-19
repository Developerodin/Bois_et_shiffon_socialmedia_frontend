"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReelOptions, ReelTemplateOption } from "@/shared";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { ConfirmDialog } from "@/components/settings/shared";
import { useBrandLook } from "@/components/library/use-brand-look";
import { usePlan } from "@/components/shell/use-plan-credits";
import { fetchShared } from "@/components/workspace/use-job";
import type { Opportunity } from "@/components/workspace/content-panels";
import { openPaywall } from "@/lib/paywall";
import { navFor } from "@/lib/nav";
import { reelOptionsUrl, reelsApi, reelsUrl } from "./api";
import { PLAN_REFUSAL, TEMPLATE_LABELS, presenterState } from "./labels";
import { TOO_LONG, type CreateBody } from "./plan-stream";
import { pressLabel, usePaidPress } from "./paid-press";
import { optionBusy, starters } from "./reel";
import { StartCard } from "./start-card";
import { useReelIdeas, useReelOptions, usePresenterRemove } from "./use-reels";
import { useReelStream } from "./use-reel-stream";
import { YourReels } from "./your-reels";

const IdeasDialog = dynamic(() => import("./ideas-dialog").then((m) => m.IdeasDialog), { ssr: false });
const PresenterDialog = dynamic(() => import("./presenter-dialog").then((m) => m.PresenterDialog), { ssr: false });

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

/** Presenters (with Make a presenter and Remove for a role that can) and templates, each with Preview and, for a role that can, Use and Preview with my photos. */
function SideColumn({ workspaceId, brandId, canCreate, sending, onUse }: {
  workspaceId: string;
  brandId: string;
  canCreate: boolean;
  sending: boolean;
  onUse: (templateId: string) => void;
}) {
  const { data, reload } = useReelOptions(workspaceId, brandId);
  const { removing, error: removeError, remove } = usePresenterRemove(workspaceId, brandId, reload);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  // A finished presenter cost credits and may be in reels, so its Remove asks first; a failed one goes at once.
  const [confirming, setConfirming] = useState<{ id: string; name: string } | null>(null);
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
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground">{presenterState(p, data?.presenterCredits ?? 0)}</span>
                  {canCreate && p.status !== "RUNNING" ? (
                    <Button type="button" variant="ghost" size="sm" disabled={removing !== null} onClick={() => (p.status === "DONE" ? setConfirming({ id: p.id, name: p.name }) : void remove(p.id))} aria-label={`Remove ${p.name}`}>
                      Remove
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p role="alert" className="text-sm text-destructive empty:hidden">{removeError}</p>
        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(o) => { if (!o) setConfirming(null); }}
          title={confirming ? `Remove ${confirming.name}?` : ""}
          description="The presenter is removed from this brand. Reels using them need another presenter. This can't be undone."
          confirmLabel="Remove"
          onConfirm={async () => { if (confirming) await remove(confirming.id); }}
        />
        {canCreate && data ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              setDialogMounted(true);
              setDialogOpen(true);
            }}
          >
            Make a presenter
          </Button>
        ) : null}
        {dialogMounted && data ? <PresenterDialog workspaceId={workspaceId} brandId={brandId} options={data} open={dialogOpen} onOpenChange={setDialogOpen} /> : null}
      </PageSection>

      <PageSection id="templates" title="Templates">
        {templates.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3">
            {templates.map((t) => (
              <li key={t.id}>
                <TemplateCard workspaceId={workspaceId} brandId={brandId} options={data} template={t} playing={playing === t.id} onPreview={() => setPlaying(t.id)} canUse={canCreate} disabled={sending} onUse={() => onUse(t.id)} />
              </li>
            ))}
          </ul>
        ) : null}
      </PageSection>
    </div>
  );
}

function TemplateCard({ workspaceId, brandId, options, template, playing, onPreview, canUse, disabled, onUse }: {
  workspaceId: string;
  brandId: string;
  options: ReelOptions | null;
  template: ReelTemplateOption;
  playing: boolean;
  onPreview: () => void;
  canUse: boolean;
  disabled: boolean;
  onUse: () => void;
}) {
  const label = TEMPLATE_LABELS[template.id] ?? { title: template.id, subtitle: "" };
  const preview = template.preview;
  const plan = usePlan(workspaceId);
  const paid = usePaidPress(workspaceId, { reread: () => fetchShared(reelOptionsUrl(workspaceId, brandId), true) });
  const busy = optionBusy(options, { templateId: template.id });
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
      {template.own ? <p className="text-xs text-muted-foreground">Made with your photos</p> : null}
      {canUse && options ? (
        <div className="flex flex-col items-start gap-1">
          {options.canPreview ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!plan.loaded || paid.pressing || busy}
              onClick={(e) => void paid.press(e, () => reelsApi.preview(workspaceId, brandId, template.id))}
            >
              {paid.pressing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {pressLabel("Preview with my photos", plan, options.previewCredits)}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Add product photos to preview templates with them.</p>
          )}
          {template.making ? <p className="text-xs text-muted-foreground">Making your preview. It takes a few minutes.</p> : null}
          {template.failed && !template.making ? <p className="text-xs text-muted-foreground">Your last preview didn&apos;t work. You weren&apos;t charged for it.</p> : null}
          <p role="alert" className="text-xs text-destructive empty:hidden">{paid.error}</p>
        </div>
      ) : null}
    </div>
  );
}
