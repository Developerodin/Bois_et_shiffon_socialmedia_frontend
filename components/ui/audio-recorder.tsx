"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/settings/shared";
import { NO_FORMAT, micProblem, pickFormat } from "@/lib/recorder";
import { clock } from "@/lib/time";

type Phase = "idle" | "opening" | "recording";

const stopTracks = (stream: MediaStream | null) => stream?.getTracks().forEach((t) => t.stop());

/**
 * One microphone take (spec §5.6, §5.9): Start recording / Stop recording, stopping by itself at `maxSeconds`. The take
 * is built in one place, `onstop`, so a manual stop and the automatic one can't both send it.
 * The microphone is on only while recording: tracks stop when the take stops, when the device changes, when
 * MediaRecorder can't start, and on unmount (closing the dialog), which also sends nothing and clears every timer. A
 * stream that arrives late (the permission prompt answered after the dialog closed, or after another request replaced
 * it) is stopped at once.
 * `onStart` runs after the browser checks and before the microphone opens; resolving false starts nothing (the clone
 * dialog asks to replace a reading there, and reads a fresh challenge).
 */
export function AudioRecorder({ maxSeconds, minSeconds, disabled, notice, onTake, onStart, label }: {
  maxSeconds: number;
  minSeconds?: number;
  disabled?: boolean;
  /** Why the browser will ask for the microphone; shown until it has been allowed. */
  notice: ReactNode;
  onTake: (blob: Blob, seconds: number) => void;
  onStart?: () => boolean | void | Promise<boolean | void>;
  /** The recorder's accessible name, e.g. "Record scene 2". */
  label: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [allowed, setAllowed] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState("");

  const alive = useRef(true);
  // Bumped by every start and device change: a stream answering an older number is stopped, not used.
  const req = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onTake, onStart });
  callbacks.current = { onTake, onStart };

  const clearTimers = () => {
    if (tick.current) clearInterval(tick.current);
    if (limit.current) clearTimeout(limit.current);
    tick.current = null;
    limit.current = null;
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      // Closing sends nothing: the handlers go before the recorder stops, then every track and timer.
      // alive false also turns away any stream still being asked for.
      alive.current = false;
      const r = recorder.current;
      if (r) {
        r.ondataavailable = null;
        r.onstop = null;
        if (r.state !== "inactive") {
          try {
            r.stop();
          } catch {
            // Already stopped.
          }
        }
      }
      recorder.current = null;
      stopTracks(stream.current);
      stream.current = null;
      clearTimers();
    };
  }, []);

  async function start() {
    if (phase !== "idle" || disabled) return;
    setProblem(null);
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) return setProblem(micProblem(null, false));
    const mimeType = typeof MediaRecorder === "undefined" ? null : pickFormat((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) return setProblem(NO_FORMAT);

    const mine = ++req.current;
    const current = () => alive.current && req.current === mine;
    setPhase("opening");
    const go = await callbacks.current.onStart?.();
    if (!current()) return;
    if (go === false) return setPhase("idle");

    let s: MediaStream;
    try {
      s = await media.getUserMedia({ audio: { deviceId: deviceId || undefined, channelCount: 1 } });
    } catch (e) {
      if (current()) {
        setProblem(micProblem(e, window.isSecureContext));
        setPhase("idle");
      }
      return;
    }
    if (!current()) return stopTracks(s);
    stream.current = s;
    setAllowed(true);
    media.enumerateDevices().then(
      (list) => { if (alive.current) setDevices(list.filter((d) => d.kind === "audioinput")); },
      () => undefined,
    );

    let r: MediaRecorder;
    try {
      r = new MediaRecorder(s, { mimeType, audioBitsPerSecond: 64_000 });
    } catch (e) {
      stopTracks(s);
      stream.current = null;
      setProblem(micProblem(e, true));
      setPhase("idle");
      return;
    }
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    r.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    r.onstop = () => {
      stopTracks(s);
      if (stream.current === s) stream.current = null;
      if (recorder.current === r) recorder.current = null;
      clearTimers();
      if (!alive.current) return;
      setPhase("idle");
      setSaid("Stopped");
      const blob = new Blob(chunks, { type: r.mimeType || mimeType });
      if (blob.size > 0) callbacks.current.onTake(blob, Math.min(maxSeconds, Math.round((Date.now() - startedAt) / 1000)));
    };
    recorder.current = r;
    try {
      r.start();
    } catch (e) {
      r.onstop = null;
      recorder.current = null;
      stopTracks(s);
      stream.current = null;
      setProblem(micProblem(e, true));
      setPhase("idle");
      return;
    }
    setSeconds(0);
    setPhase("recording");
    setSaid("Recording started");
    let warned = false;
    tick.current = setInterval(() => {
      const n = Math.min(maxSeconds, Math.floor((Date.now() - startedAt) / 1000));
      setSeconds(n);
      if (!warned && maxSeconds > 10 && maxSeconds - n <= 10) {
        warned = true;
        setSaid("10 seconds left");
      }
    }, 1000);
    limit.current = setTimeout(stop, maxSeconds * 1000);
  }

  function stop() {
    const r = recorder.current;
    if (limit.current) clearTimeout(limit.current);
    limit.current = null;
    if (r && r.state !== "inactive") r.stop();
  }

  // A new microphone: the open stream (or one still being asked for) is dropped; the next Start uses the new one.
  function changeDevice(id: string) {
    if (phase === "recording") return;
    req.current++;
    stopTracks(stream.current);
    stream.current = null;
    setDeviceId(id);
    setPhase("idle");
  }

  const recording = phase === "recording";
  const early = recording && minSeconds !== undefined && seconds < minSeconds;

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-3">
      {!allowed ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {allowed && devices.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="recorder-device" className="text-sm font-medium">Microphone</label>
          <select id="recorder-device" className={`${selectClass} rounded-xl`} value={deviceId} disabled={phase === "recording"} onChange={(e) => changeDevice(e.target.value)}>
            <option value="">Default microphone</option>
            {devices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          aria-pressed={recording}
          disabled={recording ? early : phase === "opening" || disabled}
          onClick={() => (recording ? stop() : void start())}
        >
          {recording ? <Square className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
          {recording ? "Stop recording" : "Start recording"}
        </Button>
        {recording ? <span className="text-sm tabular-nums">{`Recording, ${clock(seconds)} of ${clock(maxSeconds)}`}</span> : null}
      </div>
      {early ? <p className="text-sm text-muted-foreground">{`Keep reading: at least ${minSeconds} seconds`}</p> : null}
      <p aria-live="polite" className="sr-only">{said}</p>
      <p role="alert" className="text-sm text-destructive empty:hidden">{problem}</p>
    </div>
  );
}
