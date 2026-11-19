"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { safeHttpUrl, type ReelDetail } from "@/shared";
import { ApiError, errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { ChecksList } from "@/components/ui/checks-list";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchShared } from "@/components/workspace/use-job";
import { isRepeatClick } from "@/lib/presser";
import { reelUrl, reelsApi } from "./api";
import {
  CHECK_AUTO_MS, CHECK_SLOW_MS, REEL_CAPTION_MAX, REEL_HASHTAGS_MAX, adoptRefusedVersion, awaitingChecks, checksPollDelay, editLock,
  parseHashtags, postTextLength, reviewChecks, sendBlock, type ReelStep,
} from "./reel";
import { DRAFT_CHANGED, saveErrorText } from "./use-reel-save";

const CARD = "flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm";

/**
 * The Review step (the phone's R07): the transcript, the checks (waiting for them itself), the caption and hashtags,
 * the specs, Download (approves) and Continue to Publish. The page shows the video, with captions, in the preview.
 * Memoised: the page passes only `detail`, primitives and stable callbacks. A caption save doesn't take the plan's
 * save lock (it goes through the content route), so it has its own in-flight flag here.
 */
export const ReviewStep = memo(function ReviewStep({ workspaceId, brandId, detail, reload, canCreate, canApprove, go }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  reload: () => Promise<void>;
  canCreate: boolean;
  canApprove: boolean;
  go: (s: ReelStep) => void;
}) {
  const [savingCaption, setSavingCaption] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const plan = detail.plan;
  const block = sendBlock(detail);
  const voices = (plan?.scenes ?? []).map((s) => s.voiceText).filter(Boolean);
  const specs = [detail.seconds !== null ? `${detail.seconds} s` : null, "9:16 vertical", plan?.voiceName ?? "Voiceover"].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-4">
      {voices.length ? (
        <section aria-labelledby="review-transcript" className={CARD}>
          <h3 id="review-transcript" className="font-medium">Transcript</h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            {voices.map((v, i) => <li key={i}>{v}</li>)}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby="review-checks" className={CARD}>
        <h3 id="review-checks" className="font-medium">Checks</h3>
        <Checks workspaceId={workspaceId} brandId={brandId} detail={detail} reload={reload} canCreate={canCreate} />
      </section>

      <section aria-labelledby="review-caption" className={CARD}>
        <h3 id="review-caption" className="font-medium">Caption</h3>
        {canCreate ? (
          <CaptionEdit workspaceId={workspaceId} brandId={brandId} detail={detail} saving={savingCaption} setSaving={setSavingCaption} downloading={downloading} />
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm">{detail.caption?.caption ?? ""}</p>
            {detail.caption?.hashtags?.length ? <p className="text-sm text-muted-foreground">{detail.caption.hashtags.join(" ")}</p> : null}
          </>
        )}
        {detail.aiDisclosure ? (
          <p className="text-sm text-muted-foreground">{`Added when it's posted, and can't be removed: "${detail.aiDisclosure}" (this reel has an AI presenter or a cloned voice).`}</p>
        ) : null}
      </section>

      <p className="text-sm text-muted-foreground">{specs}</p>

      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {canApprove ? (
            <DownloadButton workspaceId={workspaceId} brandId={brandId} detail={detail} blocked={!!block || savingCaption} downloading={downloading} setDownloading={setDownloading} />
          ) : null}
          <Button type="button" disabled={!!block} onClick={() => go("publish")}>Continue to Publish</Button>
        </div>
        {canApprove ? <p className="text-sm text-muted-foreground">Downloading approves this version.</p> : (
          <p className="text-sm text-muted-foreground">Your role can&apos;t approve reels, so Download (which approves) isn&apos;t here.</p>
        )}
        {block ? <p className="text-sm text-muted-foreground">{block}</p> : null}
      </div>

      <Button type="button" variant="ghost" className="self-start" onClick={() => go("plan")}>Not right? Ask for changes</Button>
    </div>
  );
});

/**
 * The checks, or the wait for them. useReel doesn't poll for checks, so this does while they're awaited: 5 s for two
 * minutes, then 10 s, stopping at CHECK_WAIT_MS with a way to look again. For creators, one quiet recheck at
 * CHECK_AUTO_MS per visit, and the slow line with Check again from CHECK_SLOW_MS. The timers start again when the
 * version moves (a caption save) or after a Check again; they end when the checks land.
 */
function Checks({ workspaceId, brandId, detail, reload, canCreate }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  reload: () => Promise<void>;
  canCreate: boolean;
}) {
  const waiting = awaitingChecks(detail);
  const id = detail.item.id;
  const [slow, setSlow] = useState(false);
  const [ended, setEnded] = useState(false);
  const [round, setRound] = useState(0);
  const [rechecking, setRechecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The automatic recheck runs at most once while this step is open.
  const autoTried = useRef(false);

  useEffect(() => {
    if (!waiting) return;
    const start = Date.now();
    let poll: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      const delay = checksPollDelay(Date.now() - start);
      if (delay === null) return setEnded(true);
      poll = setTimeout(() => {
        // A hidden tab skips the read, as useJob pauses; the wait goes on.
        if (!document.hidden) void reload();
        next();
      }, delay);
    };
    next();
    const slowTimer = canCreate ? setTimeout(() => setSlow(true), CHECK_SLOW_MS) : undefined;
    const autoTimer = canCreate && !autoTried.current ? setTimeout(() => {
      autoTried.current = true;
      // A failure here stays quiet (the phone's rule): the polling goes on and Check again comes later.
      reelsApi.recheck(workspaceId, brandId, id).then(() => reload(), () => undefined);
    }, CHECK_AUTO_MS) : undefined;
    // Reset in the clean-up: before the next wait (version moved, Check again) and when the checks land.
    return () => {
      clearTimeout(poll);
      clearTimeout(slowTimer);
      clearTimeout(autoTimer);
      setSlow(false);
      setEnded(false);
    };
  }, [waiting, detail.version, round, canCreate, workspaceId, brandId, id, reload]);

  const recheck = useCallback(async () => {
    setRechecking(true);
    setNotice(null);
    try {
      const r = await reelsApi.recheck(workspaceId, brandId, id);
      if (r.status === "checking") setNotice("Already checking. The result will appear here.");
      await reload();
      setRound((n) => n + 1);
    } catch (e) {
      // A 429 (and any other refusal) says the server's sentence.
      setNotice(errorMessage(e));
    } finally {
      setRechecking(false);
    }
  }, [workspaceId, brandId, id, reload]);

  if (detail.checks) return <ChecksList results={reviewChecks(detail)} />;
  if (!waiting) return <p className="text-sm text-muted-foreground">No checks for this version yet.</p>;

  const checkAgain = (
    <Button type="button" variant="outline" size="sm" className="self-start" disabled={rechecking} onClick={() => void recheck()}>
      {rechecking ? "Checking…" : "Check again"}
    </Button>
  );
  return (
    <div className="flex flex-col gap-2 text-sm">
      {ended ? (
        <>
          <p role="status">The checks are taking long.</p>
          {canCreate ? checkAgain : <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => void reload()}>Read again</Button>}
        </>
      ) : slow ? (
        <>
          <p role="status">The checks are taking longer than usual. Check again, or come back in a few minutes.</p>
          {checkAgain}
        </>
      ) : (
        <p role="status" className="text-muted-foreground">Checking… usually under a minute</p>
      )}
      {notice ? <p className="text-muted-foreground">{notice}</p> : null}
    </div>
  );
}

type CaptionEditState = { version: number; caption: string; tags: string };

/**
 * Caption and hashtags, saved through the content route with the version the edit started from. A save that lost a
 * race (draft.changed) keeps the text, says so, and moves the edit to the re-read version, so the next press saves.
 */
function CaptionEdit({ workspaceId, brandId, detail, saving, setSaving, downloading }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  saving: boolean;
  setSaving: (v: boolean) => void;
  downloading: boolean;
}) {
  const [edit, setEdit] = useState<CaptionEditState | null>(null);
  const [error, setError] = useState("");
  const savedCaption = detail.caption?.caption ?? "";
  const savedTags = detail.caption?.hashtags ?? [];
  const caption = edit?.caption ?? savedCaption;
  const tagsText = edit?.tags ?? savedTags.join(" ");
  const tags = parseHashtags(tagsText);
  const length = postTextLength(caption, detail.aiDisclosure, tags);
  const dirty = !!edit && (caption !== savedCaption || tags.join(" ") !== savedTags.join(" "));
  const lock = editLock(detail);
  const reason = tags.length > REEL_HASHTAGS_MAX ? `A reel takes at most ${REEL_HASHTAGS_MAX} hashtags.`
    : length > REEL_CAPTION_MAX ? `The post is over ${REEL_CAPTION_MAX} characters. Shorten the caption or the hashtags.`
    : lock ?? (downloading ? "Wait for the download to start." : null);

  const change = (next: Partial<Pick<CaptionEditState, "caption" | "tags">>) =>
    setEdit({ version: edit?.version ?? detail.version, caption, tags: tagsText, ...next });

  async function saveCaption() {
    if (!edit || saving) return;
    setSaving(true);
    setError("");
    const url = reelUrl(workspaceId, brandId, detail.item.id);
    try {
      await reelsApi.editCaption(workspaceId, brandId, detail.item.id, edit.version, edit.caption, parseHashtags(edit.tags));
      await fetchShared(url, true).catch(() => undefined);
      setEdit(null);
    } catch (e) {
      setError(saveErrorText(e));
      if (e instanceof ApiError && e.code === DRAFT_CHANGED) {
        // Read again, then start the edit from the version read (the person was told), keeping the text.
        const reread = await fetchShared(url, true).catch(() => null) as ReelDetail | null;
        if (reread) setEdit((cur) => cur && adoptRefusedVersion(cur, true, reread.version));
      }
    } finally {
      setSaving(false);
    }
  }

  const off = saving || !!lock;
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="review-caption-text" className="sr-only">Caption</label>
      <Textarea
        id="review-caption-text"
        className="rounded-xl"
        value={caption}
        disabled={off}
        aria-describedby="review-caption-length"
        onChange={(e) => change({ caption: e.target.value })}
      />
      <p id="review-caption-length" className="text-xs text-muted-foreground">{length} of {REEL_CAPTION_MAX}</p>
      <div className="flex flex-col gap-1">
        <label htmlFor="review-hashtags" className="text-sm font-medium">Hashtags (separated by spaces)</label>
        <Input id="review-hashtags" className="rounded-xl" value={tagsText} disabled={off} aria-describedby="review-hashtags-count" onChange={(e) => change({ tags: e.target.value })} />
        <p id="review-hashtags-count" className="text-xs text-muted-foreground">{tags.length} of {REEL_HASHTAGS_MAX}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={saving || !dirty || reason !== null} onClick={() => void saveCaption()}>
          {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          Save caption
        </Button>
        {dirty && reason ? <p className="text-sm text-muted-foreground">{reason}</p> : lock ? <p className="text-sm text-muted-foreground">{lock}</p> : null}
      </div>
      <p className="text-xs text-muted-foreground">Saving the caption runs the checks again.</p>
      <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
    </div>
  );
}

/** Download: the route's `send` (approves a version awaiting approval), then the browser saves the file from its link. */
function DownloadButton({ workspaceId, brandId, detail, blocked, downloading, setDownloading }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  blocked: boolean;
  downloading: boolean;
  setDownloading: (v: boolean) => void;
}) {
  const [error, setError] = useState("");
  const busy = useRef(false);

  async function press(e: { detail: number }) {
    if (isRepeatClick(e) || busy.current) return;
    busy.current = true;
    setDownloading(true);
    setError("");
    const url = reelUrl(workspaceId, brandId, detail.item.id);
    try {
      const { downloadUrl } = await reelsApi.download(workspaceId, brandId, detail.item.id, detail.version);
      const u = safeHttpUrl(downloadUrl);
      if (!u) setError("Couldn't start the download. Try again.");
      // The link's attachment header saves the file without leaving the page.
      else window.location.assign(u.href);
      await fetchShared(url, true).catch(() => undefined);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await fetchShared(url, true).catch(() => undefined);
      setError(errorMessage(err));
    } finally {
      busy.current = false;
      setDownloading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" disabled={blocked || downloading} onClick={(e) => void press(e)}>
        {downloading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
        Download video
      </Button>
      <p role="alert" className="basis-full text-sm text-destructive empty:hidden">{error}</p>
    </>
  );
}
