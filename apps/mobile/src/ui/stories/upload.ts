import { File, type UploadTask } from "expo-file-system";
import { AppState } from "react-native";
import { ApiError, waitForServer } from "@/api/client";
import { type MediaSize, stories } from "@/api/endpoints";
import i18n from "@/i18n";
import { storyCodeText, storyError } from "@/ui/stories/errors";

export type UploadProgress = { fraction: number; offline: boolean };
/** The person cancelled: show nothing. */
export class UploadCancelled extends Error {}
/** A final answer (storage or the server refused it): show its message, don't retry. */
class Refused extends Error {}

/** Failed tries in a row while the server kept answering (so not the network): then give up and say so. */
const MAX_REACHABLE_FAILURES = 3;

/**
 * Upload one phone photo or clip for a story frame: ask for a slot, PUT the file to it with progress, then "done",
 * which checks the file. A transfer that doesn't get through says "offline", waits for the server and, if the app
 * went to the background, for its return, then starts over with a new slot (a slot's URL lasts only 600 s).
 * cancel() stops the transfer, any wait and any further step, and abandons the slot; the server's 7-day sweep removes
 * the unused row.
 *
 * Failure modes: every retry uses one of the brand's 20 slots an hour. A real outage just waits (no slot is used
 * while the server is unreachable); but 3 failed tries in a row while the server kept answering (storage
 * unreachable, a broken file) end with a final error, so the brand's slots aren't burnt in a loop; the person picks
 * again. A "done" that times out (the check took over 120 s) or whose answer was lost counts as not getting
 * through, so the whole file is resent to a new slot; the first verified file is then unused and swept.
 */
/** A clip's `size` is its upright size from the server's check, which is what the renderer crops. */
type Uploaded = { uploadId: string; durationSec?: number; size?: MediaSize };

export function uploadToSlot(uri: string, kind: "photo" | "video", bytes: number, contentType: string, onProgress: (p: UploadProgress) => void) {
  let cancelled = false;
  let task: UploadTask | null = null;
  const ctrl = new AbortController();
  const stopped = new Promise<never>((_, reject) => ctrl.signal.addEventListener("abort", () => reject(new UploadCancelled())));
  stopped.catch(() => {});
  const guard = <T>(p: Promise<T>) => Promise.race([p, stopped]);
  // Nothing reaches the screen once cancelled (a late native progress event, an attempt still finishing its slot).
  const report = (p: UploadProgress) => !cancelled && onProgress(p);
  const stillWanted = () => {
    if (cancelled) throw new UploadCancelled();
  };

  const attempt = async () => {
    let slot;
    try {
      slot = await stories.uploadSlot({ kind, contentType, bytes });
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) throw new Refused(storyError(e));
      throw e;
    }
    stillWanted();
    report({ fraction: 0, offline: false });
    task = new File(uri).createUploadTask(slot.url, {
      httpMethod: "PUT",
      headers: slot.headers,
      onProgress: ({ bytesSent, totalBytes }) => report({ fraction: totalBytes ? bytesSent / totalBytes : 0, offline: false }),
    });
    const put = await guard(task.uploadAsync());
    task = null;
    if (put.status < 200 || put.status > 299) throw new Refused(i18n.t("common:net.failed"));
    stillWanted();
    let done;
    try {
      done = await stories.uploadDone(slot.uploadId);
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) throw new Refused(storyError(e));
      throw e;
    }
    stillWanted();
    if (done.status === "REJECTED") throw new Refused(storyCodeText(done.code, done.reason));
    return { uploadId: slot.uploadId, ...(done.durationSec === undefined ? {} : { durationSec: done.durationSec }), ...(done.width && done.height ? { size: { width: done.width, height: done.height } } : {}) };
  };

  const run = async (): Promise<Uploaded> => {
    if (!new File(uri).exists) throw new Refused(i18n.t("common:net.failed"));
    let reachableFailures = 0;
    for (;;) {
      try {
        return await guard(attempt());
      } catch (e) {
        if (cancelled) throw new UploadCancelled();
        if (e instanceof Refused) throw e;
        // Didn't get through (no network, storage unreachable, the app was suspended): wait, then a new slot.
      }
      const background = AppState.currentState !== "active";
      report({ fraction: 0, offline: true });
      const wasUnreachable = await guard(waitForServer(ctrl.signal));
      if (background || wasUnreachable) reachableFailures = 0;
      else if (++reachableFailures >= MAX_REACHABLE_FAILURES) throw new Refused(i18n.t("common:net.failed"));
      if (AppState.currentState !== "active") await guard(untilActive(ctrl.signal));
    }
  };

  return {
    promise: run(),
    cancel() {
      cancelled = true;
      task?.cancel();
      ctrl.abort();
    },
  };
}

/** Resolves when the app is in the foreground again; an aborted signal removes the listener. */
const untilActive = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      sub.remove();
      resolve();
    });
    signal.addEventListener("abort", () => sub.remove());
  });
