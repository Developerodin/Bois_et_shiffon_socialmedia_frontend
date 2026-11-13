import { useEffect, useState } from "react";

const POLL_MS = 5_000;
const CAP_MS = 3 * 60_000;

/**
 * While a post or story is being written, rendered or checked (`working`), calls `tick` every 5 s so the result shows up
 * on its own, for up to 3 minutes: a writer that never starts mustn't poll forever. Then `slow` is true for the version
 * it was waiting on (`waitingOn`; a newer one starts the wait again). `retry` clears `slow` and starts another 3 minutes.
 * `tick` must be stable (useCallback or a module function), or the wait restarts on every render.
 */
export function useWorkingPoll(working: boolean, waitingOn: number, tick: () => unknown) {
  const [slowAt, setSlowAt] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void tick(), POLL_MS);
    const stop = setTimeout(() => (clearInterval(timer), setSlowAt(waitingOn)), CAP_MS);
    return () => (clearInterval(timer), clearTimeout(stop));
  }, [working, waitingOn, tick, round]);
  return {
    slow: slowAt === waitingOn,
    retry: () => {
      setSlowAt(null);
      setRound((n) => n + 1);
    },
  };
}
