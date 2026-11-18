"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { MAX_CLONE_BYTES, NAME_MAX, type CloningInfo } from "@/shared";
// Straight from its file, not the @/shared barrel. While the barrel still re-exports it (shared/contract/index.ts, server-owned),
// the passages ship in the common chunk all the same; once the barrel stops, this import alone keeps them in this lazy chunk.
import { CLONE_PASSAGES } from "@/shared/contract/clone-passages";
import { AudioRecorder } from "@/components/ui/audio-recorder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/settings/shared";
import { ApiError, errorMessage } from "@/components/settings/api";
import { usePlan } from "@/components/shell/use-plan-credits";
import { fetchShared } from "@/components/workspace/use-job";
import { requestId } from "@/lib/net";
import { voicesApi, voicesUrl } from "./api";
import { pressLabel, usePaidPress } from "./paid-press";
import { useSample } from "./use-sample";
import { useVoices } from "./use-reels";
import { cloneRetry, isAbort, languageName, readableChallenge, readingLanguage, reusableChallenge, type ChallengeEntry } from "./voices";

// Copy: the phone's clone.* (mobile reels.json); the desktop-only lines are spec §5.6.
// The only importer of CLONE_PASSAGES; only its languages are used here.
const LANGS = Object.keys(CLONE_PASSAGES).sort((a, b) => languageName(a).localeCompare(languageName(b)));
const NOTICE = "Your browser will ask to use the microphone. The reading is sent to us only to make this voice, and isn't kept.";
const LANG_WAIT_MS = 400;
// ponytail: a voice the server answered for but doesn't list yet is read again this often while the dialog stays open.
const STILL_MAKING_MS = 4_000;
const TAKE = "clone-reading";

type Reading = { blob: Blob; url: string; seconds: number; requestId: string; challengeId: string };

const readingName = (blob: Blob) => (blob.type.includes("mp4") ? "reading.m4a" : "reading.webm");

/**
 * Clone a voice (spec §5.6, phone clone.tsx): pick the reading language, read the server's challenge aloud for
 * `cloning.seconds`, name the voice, agree to the server's consent text, then one paid press. Mounted only while open,
 * so closing turns the microphone off and drops the reading; the last challenge lives in `challengeCache` (held by the
 * Script step) so reopening shows the same sentences while they are unsent and fresh. Each take gets its own requestId:
 * a press whose answer was lost (or a voice still being made) is repeated with the same take and id, never charged
 * twice; any other answer used the challenge, so the take is dropped and a new challenge read (`cloneRetry`). No file
 * input: clones are recorded live (security A1).
 */
export function CloneDialog({ workspaceId: w, brandId: b, cloning, open, onOpenChange, onCloned, challengeCache }: {
  workspaceId: string;
  brandId: string;
  cloning: CloningInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloned: () => void;
  challengeCache: { current: ChallengeEntry | null };
}) {
  const plan = usePlan(w);
  const { data, reload } = useVoices(w, b);
  const sample = useSample();
  const stopSample = sample.stop; // module-level: the same function every render
  const rereadVoices = useCallback(() => fetchShared(voicesUrl(w, b), true), [w, b]);
  const { pressing, error, press } = usePaidPress(w, { reread: rereadVoices });

  const [start] = useState(() => {
    const lang = readingLanguage(typeof navigator !== "undefined" ? navigator.languages ?? [] : [], LANGS);
    return { lang, entry: reusableChallenge(challengeCache.current, lang, Date.now()) };
  });
  const [lang, setLang] = useState(start.lang);
  const [entry, setEntry] = useState<ChallengeEntry | null>(start.entry);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [consentSeen, setConsentSeen] = useState(cloning.consentVersion);
  const [take, setTake] = useState<Reading | null>(null);
  const [confirm, setConfirm] = useState<((ok: boolean) => void) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The id the server answered with, until the voices list shows it.
  const [made, setMade] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const firstRead = useRef(true);
  const startedWith = useRef<ChallengeEntry | null>(null);

  // A new consent text (the server changed it) needs a new tick.
  if (consentSeen !== cloning.consentVersion) {
    setConsentSeen(cloning.consentVersion);
    setAgreed(false);
  }

  const current = entry?.lang === lang ? entry : null;
  const trimmed = name.trim();
  const listed = made !== null && !!data?.voices.some((v) => v.id === made);
  const url = take?.url ?? null;

  /** Reads a new challenge for `l`, dropping any read still out. Resolves the entry, or null (aborted or failed). */
  const readChallenge = useCallback(async (l: string): Promise<ChallengeEntry | null> => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setEntry(null);
    setChallengeError(null);
    try {
      const challenge = await voicesApi.challenge(w, b, l, c.signal);
      if (c.signal.aborted) return null;
      const next = { lang: l, challenge, at: Date.now() };
      challengeCache.current = next;
      setEntry(next);
      return next;
    } catch (e) {
      if (!c.signal.aborted && !isAbort(e)) setChallengeError(errorMessage(e));
      return null;
    }
  }, [w, b, challengeCache]);

  // On open, then once the language has stayed put for LANG_WAIT_MS; a kept challenge for it that is unsent and fresh is reused.
  useEffect(() => {
    const kept = reusableChallenge(challengeCache.current, lang, Date.now());
    if (kept) {
      firstRead.current = false;
      setEntry(kept);
      return;
    }
    const t = setTimeout(() => {
      firstRead.current = false;
      void readChallenge(lang);
    }, firstRead.current ? 0 : LANG_WAIT_MS);
    return () => {
      clearTimeout(t);
      ctrl.current?.abort();
    };
  }, [lang, readChallenge, challengeCache]);

  // A new take, a success, closing and unmounting all end the reading's link.
  useEffect(() => {
    if (!url) return;
    return () => {
      stopSample();
      URL.revokeObjectURL(url);
    };
  }, [url, stopSample]);

  // Closed only once the list shows the new voice; until then it is read again (the press stays off).
  useEffect(() => {
    if (!listed) return;
    onOpenChange(false);
    onCloned();
  }, [listed, onOpenChange, onCloned]);
  useEffect(() => {
    if (!made || listed) return;
    const t = setInterval(() => void reload(), STILL_MAKING_MS);
    return () => clearInterval(t);
  }, [made, listed, reload]);

  /** The server takes a challenge on any answer: it is never offered again, here or on reopening. */
  function markUsed(challengeId: string) {
    setEntry((e) => (e && e.challenge.challengeId === challengeId ? { ...e, used: true } : e));
    const kept = challengeCache.current;
    if (kept?.challenge.challengeId === challengeId) challengeCache.current = { ...kept, used: true };
  }

  // Before the microphone opens: a finished reading is replaced only on purpose, and an old or sent challenge is read again.
  async function beforeRecording(): Promise<boolean> {
    setProblem(null);
    if (take) {
      const ok = await new Promise<boolean>((resolve) => setConfirm(() => resolve));
      setConfirm(null);
      if (!ok) return false;
      setTake(null);
    }
    const e = readableChallenge(current, Date.now()) ? current : await readChallenge(lang);
    startedWith.current = e;
    return e !== null;
  }

  function took(blob: Blob, seconds: number) {
    const e = startedWith.current;
    if (!e) return;
    if (seconds < cloning.seconds.min) {
      setProblem(`Keep reading until ${cloning.seconds.min} seconds.`);
      return;
    }
    setTake({ blob, seconds, url: URL.createObjectURL(blob), requestId: requestId(), challengeId: e.challenge.challengeId });
  }

  async function create(ev: { detail: number }) {
    if (!take || !trimmed || !agreed || made) return;
    if (take.blob.size > MAX_CLONE_BYTES) {
      setProblem("That recording is too large.");
      return;
    }
    setProblem(null);
    const sent = take;
    const body = { file: sent.blob, fileName: readingName(sent.blob), name: trimmed, challengeId: sent.challengeId, consentVersion: cloning.consentVersion };
    const result = await press(ev, async () => {
      markUsed(sent.challengeId);
      setSending(true);
      try {
        return await voicesApi.clone(w, b, body, sent.requestId);
      } finally {
        setSending(false);
      }
    });
    if (result.ok) {
      setTake(null);
      await rereadVoices().catch(() => undefined);
      setMade((result.value as { id: string }).id);
      return;
    }
    // null: an ignored repeat click, or no plan (the paywall opened and nothing was sent).
    if (result.error === null) return;
    if (result.error instanceof ApiError && result.error.code === "clone.consentChanged") {
      setAgreed(false);
      void rereadVoices().catch(() => undefined);
    }
    if (cloneRetry(result.error) === "new-take") {
      setTake(null);
      void readChallenge(lang);
    }
  }

  const stillMaking = made !== null && !listed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Clone a voice</DialogTitle>
          <DialogDescription>{`Read the passage below aloud for ${cloning.seconds.min} to ${cloning.seconds.max} seconds, in a quiet room. The voice can then read any reel in this workspace.`}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <label htmlFor="clone-lang" className="text-sm font-medium">Reading language</label>
          <select id="clone-lang" className={`${selectClass} h-11 rounded-xl`} value={lang} disabled={!!take || pressing} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map((l) => <option key={l} value={l}>{languageName(l)}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Read this</p>
          {current ? (
            <p lang={current.challenge.lang} className="text-sm leading-relaxed">{current.challenge.sentences.join(" ")}</p>
          ) : challengeError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-sm text-destructive">{challengeError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void readChallenge(lang)}>Try again</Button>
            </div>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">Loading…</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="clone-name" className="text-sm font-medium">Voice name</label>
          <Input id="clone-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} required placeholder="e.g. Léa's voice" autoComplete="off" className="h-11 rounded-xl" />
        </div>

        <AudioRecorder
          label="Record your reading"
          minSeconds={cloning.seconds.min}
          maxSeconds={cloning.seconds.max}
          disabled={!current || pressing || made !== null}
          notice={NOTICE}
          onStart={beforeRecording}
          onTake={took}
        />

        {confirm ? (
          <div role="group" aria-labelledby="clone-replace" className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
            <p id="clone-replace" className="text-sm font-medium">Record again?</p>
            <p className="text-sm text-muted-foreground">Your reading so far is replaced.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" autoFocus onClick={() => confirm(false)}>Cancel</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => confirm(true)}>Record again</Button>
            </div>
          </div>
        ) : null}

        {take ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">{`Recorded · ${take.seconds} s`}</span>
            <Button type="button" variant="outline" size="sm" aria-pressed={sample.playing === TAKE} onClick={() => sample.toggle(TAKE, take.url)}>
              {sample.playing === TAKE ? <Square className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              Play the reading back
            </Button>
          </div>
        ) : null}

        {/* The consent text is the server's, shown in full and never reworded; its version is what the voice's consent record names. */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted px-4 py-3">
          <p className="text-sm font-medium">Consent</p>
          <p id="clone-consent" className="whitespace-pre-line text-sm">{cloning.consent}</p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-describedby="clone-consent"
              className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            I agree
          </label>
          <p className="text-xs text-muted-foreground">{`Consent version ${cloning.consentVersion}`}</p>
        </div>

        <div className="flex flex-col items-start gap-2">
          <Button type="button" disabled={!plan.loaded || !take || !trimmed || !agreed || pressing || made !== null} onClick={(e) => void create(e)}>
            {pressing || stillMaking ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {pressLabel("Create the voice", plan, cloning.credits)}
          </Button>
          <p role="status" className="text-sm text-muted-foreground empty:hidden">{sending ? "Creating the voice…" : stillMaking ? "Still being made…" : ""}</p>
          <p role="alert" className="text-sm text-destructive empty:hidden">{problem ?? error}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
