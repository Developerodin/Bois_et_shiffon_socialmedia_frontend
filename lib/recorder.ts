/** Formats to try for a recording, best first. Never Ogg: the server refuses it. */
export const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

/** The first of RECORDER_TYPES the browser can record, or null. Pass MediaRecorder.isTypeSupported. */
export const pickFormat = (isTypeSupported: (t: string) => boolean): string | null => RECORDER_TYPES.find((t) => isTypeSupported(t)) ?? null;

export const NO_FORMAT = "This browser can't record audio here. Use a recent Chrome, Edge, Firefox or Safari.";

/** What to tell someone whose microphone didn't start; `secure` is window.isSecureContext (browsers refuse the mic elsewhere). */
export function micProblem(e: unknown, secure: boolean): string {
  if (!secure) return "Recording needs a secure (https) page.";
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") return "Your browser blocked the microphone. Allow it from the icon in the address bar, then try again.";
  if (name === "NotFoundError") return "No microphone found. Plug one in, or upload a file instead.";
  if (name === "NotReadableError") return "Your microphone is busy in another app. Close it there, then try again.";
  return "Couldn't start recording. Try again.";
}

/** Why an uploaded file is refused, or null. The limit is MAX_RECORDING_BYTES (1 MB). */
export const fileProblem = (file: { size: number }, maxBytes: number): string | null => (file.size > maxBytes ? "Keep the file under 1 MB." : null);
