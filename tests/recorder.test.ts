import { describe, expect, it } from "vitest";
import { MAX_RECORDING_BYTES } from "@/shared";
import { NO_FORMAT, RECORDER_TYPES, fileProblem, micProblem, pickFormat } from "@/lib/recorder";
import { clock } from "@/lib/time";

const named = (name: string) => Object.assign(new Error("x"), { name });

describe("recorder", () => {
  it("never offers Ogg", () => expect(RECORDER_TYPES.some((t) => t.includes("ogg"))).toBe(false));
  it("picks the first supported format", () => {
    expect(pickFormat((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickFormat(() => false)).toBeNull();
    expect(pickFormat((t) => t.includes("ogg") || t === "audio/webm")).toBe("audio/webm");
  });
  it("says why the microphone failed", () => {
    expect(micProblem(named("NotAllowedError"), false)).toBe("Recording needs a secure (https) page.");
    expect(micProblem(named("NotAllowedError"), true)).toBe("Your browser blocked the microphone. Allow it from the icon in the address bar, then try again.");
    expect(micProblem(named("NotFoundError"), true)).toBe("No microphone found. Plug one in, or upload a file instead.");
    expect(micProblem(named("NotReadableError"), true)).toBe("Your microphone is busy in another app. Close it there, then try again.");
    expect(micProblem(new Error("?"), true)).toBe("Couldn't start recording. Try again.");
    expect(micProblem(null, true)).toBe("Couldn't start recording. Try again.");
  });
  it("words the no-format case", () => expect(NO_FORMAT).toBe("This browser can't record audio here. Use a recent Chrome, Edge, Firefox or Safari."));
  it("refuses a file over the limit only", () => {
    expect(fileProblem({ size: MAX_RECORDING_BYTES + 1 }, MAX_RECORDING_BYTES)).toBe("Keep the file under 1 MB.");
    expect(fileProblem({ size: MAX_RECORDING_BYTES }, MAX_RECORDING_BYTES)).toBeNull();
  });
  it("formats a clock", () => {
    expect(clock(7)).toBe("0:07");
    expect(clock(90)).toBe("1:30");
  });
});
