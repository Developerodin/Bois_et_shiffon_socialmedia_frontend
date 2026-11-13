import { File, type UploadTask } from "expo-file-system";
import { AppState } from "react-native";
import { ApiError, waitForServer } from "@/api/client";
import { stories } from "@/api/endpoints";
import i18n from "@/i18n";
import { storyCodeText, storyError } from "@/ui/stories/errors";

export type UploadProgress = { fraction: number; offline: boolean };
/** The person cancelled: show nothing. */
export class UploadCancelled extends Error {}
/** A final answer (storage or the server refused it): show its message, don't retry. */
class Refused extends Error {}

/**
 * Upload one phone photo or clip for a story frame: ask for a slot, PUT the file to it with progress, then "done",
 * which checks the file. A transfer that doesn't get through says "offline", waits for the server and, if the app
 * went to the background, for its return, then starts over with a new slot (a slot's URL lasts only 600 s).
 * cancel() stops the transfer and abandons the slot; the server's 7-day sweep removes the unused row.
 *
 * Failure modes: every retry uses one of the brand's 20 slots an hour, so a long flaky stretch ends in
 * story.uploadLimit (shown, not retried). A "done" whose answer was lost is redone with a new slot; the first
 * verified file is then unused and swept. A cancelled wait leaves its listener until the app is next online/active.
 */
export function uploadToSlot(uri: string, kind: "photo" | "video", bytes: number, contentType: string, onProgress: (p: UploadProgress) => void) {
  let cancelled = false;
  let task: UploadTask | null = null;
  let stop!: () => void;
  const stopped = new Promise<never>((_, reject) => (stop = () => reject(new UploadCancelled())));
  stopped.catch(() => {});
  const guard = <T>(p: Promise<T>) => Promise.race([p, stopped]);

  const attempt = async () => {
    let slot;
    try {
      slot = await stories.uploadSlot({ kind, contentType, bytes });
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) throw new Refused(storyError(e));
      throw e;
    }
    onProgress({ fraction: 0, offline: false });
    task = new File(uri).createUploadTask(slot.url, {
      httpMethod: "PUT",
      headers: slot.headers,
      onProgress: ({ bytesSent, totalBytes }) => onProgress({ fraction: totalBytes ? bytesSent / totalBytes : 0, offline: false }),
    });
    const put = await guard(task.uploadAsync());
    task = null;
    if (put.status < 200 || put.status > 299) throw new Refused(i18n.t("common:net.failed"));
    let done;
    try {
      done = await stories.uploadDone(slot.uploadId);
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) throw new Refused(storyError(e));
      throw e;
    }
    if (done.status === "REJECTED") throw new Refused(storyCodeText(done.code, done.reason));
    return { uploadId: slot.uploadId, ...(done.durationSec === undefined ? {} : { durationSec: done.durationSec }) };
  };

  const run = async (): Promise<{ uploadId: string; durationSec?: number }> => {
    if (!new File(uri).exists) throw new Refused(i18n.t("common:net.failed"));
    for (;;) {
      try {
        return await guard(attempt());
      } catch (e) {
        if (cancelled) throw new UploadCancelled();
        if (e instanceof Refused) throw e;
        // Didn't get through (no network, storage unreachable, the app was suspended): wait, then a new slot.
      }
      onProgress({ fraction: 0, offline: true });
      await guard(waitForServer());
      if (AppState.currentState !== "active") await guard(untilActive());
    }
  };

  return {
    promise: run(),
    cancel() {
      cancelled = true;
      task?.cancel();
      stop();
    },
  };
}

const untilActive = () =>
  new Promise<void>((resolve) => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      sub.remove();
      resolve();
    });
  });
