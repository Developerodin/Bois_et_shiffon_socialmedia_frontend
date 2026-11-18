"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { MAX_RECORDING_BYTES, MAX_RECORDING_SECONDS, type ReelDetail } from "@/shared";
import { AudioRecorder } from "@/components/ui/audio-recorder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/components/settings/api";
import { fileProblem } from "@/lib/recorder";
import { reelsApi, type Take } from "./api";
import { takeLanded } from "./reel";
import type { ReelSave } from "./use-reel-save";
import { useSample } from "./use-sample";

// Copy: the phone's record.* (mobile reels.json); the desktop-only lines are spec §5.6 and §5.9.
const NOTICE = "Your browser will ask to use the microphone. The recording is sent to us only to check it and make your voiceover.";
const ACCEPT = ".m4a,.mp4,.webm,audio/mp4,audio/x-m4a,audio/webm";
const TAKE = "record-take";

const takeName = (blob: Blob) => (blob.type.includes("mp4") ? "take.m4a" : "take.webm");

/**
 * Record (or upload) one scene's voiceover. Mounted only while a scene is chosen, so closing unmounts the recorder (the
 * microphone goes off) and revokes the take's link. The take is checked against the scene's saved text, then
 * Use this recording (or Keep it, which also takes what was said as the text) saves it with the page's one save.
 */
export function RecordDialog({ workspaceId, brandId, detail, scene, save, onClose }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  /** The scene's index (0-based). */
  scene: number;
  save: ReelSave;
  onClose: () => void;
}) {
  const plan = detail.plan;
  const saved = plan?.scenes[scene];
  const n = scene + 1;
  const sample = useSample();
  const stopSample = sample.stop; // module-level: the same function every render
  const [checking, setChecking] = useState(false);
  const [take, setTake] = useState<{ result: Take; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // This dialog pressed save: only then is the page-wide save error its to show.
  const [tried, setTried] = useState(false);
  const alive = useRef(true);
  const url = take?.url ?? null;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A new take, Record again, closing (Esc included) and unmounting all end the old link.
  useEffect(() => {
    if (!url) return;
    return () => {
      stopSample();
      URL.revokeObjectURL(url);
    };
  }, [url, stopSample]);

  async function check(blob: Blob, fileName: string) {
    if (!saved || checking) return;
    setChecking(true);
    setError(null);
    setNote(null);
    setTake(null);
    try {
      const result = await reelsApi.recording(workspaceId, brandId, detail.item.id, blob, fileName, saved.voiceText, plan?.language);
      if (alive.current) setTake({ result, url: URL.createObjectURL(blob) });
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setChecking(false);
    }
  }

  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!file) return;
    const problem = fileProblem(file, MAX_RECORDING_BYTES);
    if (problem) {
      setTake(null);
      setNote(null);
      setError(problem);
      return;
    }
    void check(file, file.name);
  }

  async function use(keepWhatWasSaid: boolean) {
    if (!take || !plan) return;
    const { result } = take;
    setTried(true);
    setNote(null);
    save.clear();
    const next = {
      ...plan,
      scenes: plan.scenes.map((s, i) => (i === scene
        ? { ...s, recordingId: result.id, recordingSeconds: result.seconds, ...(keepWhatWasSaid ? { voiceText: result.transcript } : {}) }
        : s)),
    };
    const out = await save.save(detail.version, next);
    if (!out || !alive.current) return;
    if (!takeLanded(out, scene, result.id)) {
      setTake(null);
      setNote(`The plan changed while you recorded. Record scene ${n} again.`);
      return;
    }
    onClose();
  }

  const busy = checking || save.saving;
  const heard = take?.result.transcript.trim() ?? "";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{`Record scene ${n}`}</DialogTitle>
          <DialogDescription>{`Read the text below in your own voice, up to ${MAX_RECORDING_SECONDS} seconds.`}</DialogDescription>
        </DialogHeader>
        {saved ? (
          <>
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Read this</p>
              <p className="text-sm">{saved.voiceText}</p>
            </div>

            <AudioRecorder
              label={`Record scene ${n}`}
              maxSeconds={MAX_RECORDING_SECONDS}
              disabled={busy}
              notice={NOTICE}
              onStart={() => { setTake(null); setError(null); setNote(null); }}
              onTake={(blob) => void check(blob, takeName(blob))}
            />

            <div className="flex flex-col gap-1">
              <label htmlFor="record-file" className="text-sm font-medium">Or upload an audio file, up to 15 seconds</label>
              <input
                id="record-file"
                type="file"
                accept={ACCEPT}
                disabled={busy}
                onChange={upload}
                className="text-sm file:mr-3 file:rounded-full file:border file:border-border file:bg-card file:px-4 file:py-2 file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
            </div>
          </>
        ) : <p className="text-sm text-muted-foreground">This scene isn&apos;t in the plan any more.</p>}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {checking ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          <p aria-live="polite" className="empty:hidden">
            {checking ? "Checking what we heard…" : take ? (take.result.matches ? "We heard" : "We heard something different") : ""}
          </p>
        </div>

        {take ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
            <p className="text-sm">{heard || "Nothing. Check your microphone and record again, a little closer."}</p>
            {!take.result.matches && heard ? (
              <p className="text-xs text-muted-foreground">Keep it, and the scene&apos;s text becomes what you said, so approvers read what is spoken. Or record again.</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" aria-pressed={sample.playing === TAKE} onClick={() => sample.toggle(TAKE, take.url)}>
                {sample.playing === TAKE ? <Square className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                Play take
              </Button>
              {take.result.matches ? (
                <Button type="button" size="sm" disabled={busy} onClick={() => void use(false)}>
                  {save.saving ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                  Use this recording
                </Button>
              ) : heard ? (
                <Button type="button" size="sm" disabled={busy} onClick={() => void use(true)}>
                  {save.saving ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                  Keep it
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setTake(null); setTried(false); }}>Record again</Button>
            </div>
          </div>
        ) : null}

        {note ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}
        <p role="alert" className="text-sm text-destructive empty:hidden">{error ?? (tried && !save.saving ? save.error : null)}</p>
      </DialogContent>
    </Dialog>
  );
}
