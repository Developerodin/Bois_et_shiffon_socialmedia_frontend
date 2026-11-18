"use client";

import { memo, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Mic } from "lucide-react";
import { VOICE_TEXT_MAX, type ReelDetail } from "@/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { droppedRecordings, editLock, recordedScenes, sceneCount, sceneProblems } from "./reel";
import type { ReelSave } from "./use-reel-save";
import { useSample } from "./use-sample";
import { useStepEdit } from "./use-step-edit";
import { useVoices } from "./use-reels";
import { VoiceRow } from "./voice-row";
import { GENDER_LABELS } from "./voices";

const VoicesSheet = dynamic(() => import("./voices-sheet").then((m) => m.VoicesSheet), { ssr: false });
const RecordDialog = dynamic(() => import("./record-dialog").then((m) => m.RecordDialog), { ssr: false });

/**
 * The Script & voice step: the reel's voice, one text box per scene, and each scene's own recording. Text edits stay
 * here until Save script, which sends one save with the version the edit started from and trimmed texts (the server
 * keeps a take only when its text still matches). Memoised: the page passes it stable props, so stream frames skip it.
 * Change voice opens the Voices sheet (mounted on first open, then kept). Record opens the record dialog for one scene,
 * mounted only while that scene is chosen (closing it turns the microphone off). A scene whose text has unsaved edits
 * can't be recorded: the take is checked against the saved text.
 */
export const ScriptStep = memo(function ScriptStep({ workspaceId, brandId, detail, canCreate, save, chatBusy }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  canCreate: boolean;
  save: ReelSave;
  chatBusy: boolean;
}) {
  const plan = detail.plan;
  const { edit, note, change, send, submit, error } = useStepEdit<string>(detail, save, plan?.scenes.length ?? null, "The plan changed: edit the script again.");
  const voices = useVoices(workspaceId, brandId).data;
  const sample = useSample();
  const [dropped, setDropped] = useState<string[]>([]);
  const [voicesMounted, setVoicesMounted] = useState(false);
  const [voicesOpen, setVoicesOpen] = useState(false);
  const [recordScene, setRecordScene] = useState<number | null>(null);
  const closeRecord = useCallback(() => setRecordScene(null), []);
  // Task 9 opens the clone dialog here; the sheet shows no Clone button until it exists.
  const openClone = useCallback(() => undefined, []);

  if (!plan) return <p className="text-sm text-muted-foreground">Plan a reel first: the script belongs to its scenes.</p>;

  const planTexts = plan.scenes.map((s) => s.voiceText);
  const texts = edit && edit.items.length === planTexts.length ? edit.items : planTexts;
  const dirty = texts.some((t, i) => t !== planTexts[i]);
  const problems = sceneProblems(texts, recordedScenes(plan.scenes, texts));
  const reason = problems.find((p) => p !== null) ?? null;
  const lock = editLock(detail);
  const editable = lock === null && canCreate;
  const busy = chatBusy || save.saving;

  const voice = voices?.voices.find((v) => v.id === plan.voice);
  const fromLibrary = plan.voice.startsWith("library:");
  const voiceDetail = voice ? GENDER_LABELS[voice.gender]
    : fromLibrary ? "From the ElevenLabs library"
    : voices ? <span className="text-destructive">This reel&apos;s voice isn&apos;t available any more. Pick another.</span>
    : null;

  function type(i: number, value: string) {
    setDropped([]);
    change(texts.map((t, n) => (n === i ? value : t)));
  }

  async function saveScript() {
    if (!edit || !plan) return;
    setDropped([]);
    const out = await submit({ ...plan, scenes: plan.scenes.map((s, i) => ({ ...s, voiceText: (edit.items[i] ?? s.voiceText).trim() })) });
    if (out) setDropped(droppedRecordings(out.droppedRecordings));
  }

  async function remove(i: number) {
    if (!plan) return;
    setDropped([]);
    await send(detail.version, { ...plan, scenes: plan.scenes.map((s, n) => (n === i ? { ...s, recordingId: undefined, recordingSeconds: undefined } : s)) });
  }

  return (
    <div className="flex flex-col gap-4">
      {lock ? <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">{lock}</p> : null}
      {!canCreate ? <p className="text-sm text-muted-foreground">Your role can view reels but not make them.</p> : null}
      {note ? <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">{note}</p> : null}

      <div className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
        <VoiceRow
          prefix="Voice: "
          name={voice?.name ?? plan.voiceName ?? "…"}
          detail={voiceDetail}
          sampleUrl={voice?.sampleUrl ?? null}
          playing={!!voice && sample.playing === voice.id}
          onToggle={() => { if (voice?.sampleUrl) sample.toggle(voice.id, voice.sampleUrl); }}
          action={editable ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setVoicesMounted(true); setVoicesOpen(true); }}>Change voice</Button>
          ) : null}
        />
      </div>
      {voicesMounted ? (
        <VoicesSheet workspaceId={workspaceId} brandId={brandId} detail={detail} save={save} open={voicesOpen} onOpenChange={setVoicesOpen} onClone={openClone} />
      ) : null}

      {recordScene !== null && editable ? (
        <RecordDialog workspaceId={workspaceId} brandId={brandId} detail={detail} scene={recordScene} save={save} onClose={closeRecord} />
      ) : null}

      <ol className="flex flex-col gap-3">
        {plan.scenes.map((s, i) => {
          const id = `script-${i}`;
          const problem = edit ? problems[i] ?? null : null;
          const recorded = !!s.recordingId;
          const sceneDirty = texts[i] !== planTexts[i];
          return (
            <li key={i} className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
              <label htmlFor={id} className="text-sm font-medium">Scene {i + 1} voiceover</label>
              <Textarea
                id={id}
                className="rounded-xl"
                value={texts[i] ?? ""}
                maxLength={VOICE_TEXT_MAX}
                disabled={!editable || busy}
                aria-describedby={`${id}-count${problem ? ` ${id}-problem` : ""}`}
                onChange={(e) => type(i, e.target.value)}
              />
              <p id={`${id}-count`} className="text-xs text-muted-foreground">{sceneCount(texts[i] ?? "")}</p>
              {problem ? <p id={`${id}-problem`} className="text-xs text-destructive">{problem}</p> : null}
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {recorded ? <span>{`Recorded · ${(s.recordingSeconds ?? 0).toFixed(1)} s`}</span> : <span>Uses the voice above</span>}
                {editable ? (
                  <Button type="button" variant="outline" size="sm" disabled={busy || sceneDirty} aria-label={recorded ? `Record scene ${i + 1} again` : `Record scene ${i + 1}`} onClick={() => setRecordScene(i)}>
                    <Mic className="size-4" aria-hidden="true" />
                    {recorded ? "Record again" : "Record"}
                  </Button>
                ) : null}
                {recorded && editable ? (
                  <Button type="button" variant="ghost" size="sm" disabled={busy || dirty} onClick={() => void remove(i)}>Remove</Button>
                ) : null}
              </div>
              {recorded ? <p className="text-xs text-muted-foreground">Editing this text drops its recording.</p> : null}
              {editable && (sceneDirty || (recorded && dirty)) ? <p className="text-xs text-muted-foreground">Save your script changes before recording.</p> : null}
            </li>
          );
        })}
      </ol>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={busy || !dirty || reason !== null} onClick={() => void saveScript()}>
            {save.saving ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            Save script
          </Button>
          {dirty && reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
        </div>
      ) : null}
      {dropped.map((line) => <p key={line} role="status" className="text-sm text-muted-foreground">{line}</p>)}
      <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
    </div>
  );
});
