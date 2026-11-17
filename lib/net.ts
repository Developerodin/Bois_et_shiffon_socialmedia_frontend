/**
 * Every browser request to our API goes through `send` (components/settings/api.ts and components/context/api.ts
 * build on it). It turns the ways a network fails into errors people can act on, and gives reads one more try once
 * the connection is back:
 * - offline (the browser says so): a read (GET) waits for the connection, up to a minute, then retries once;
 *   a write fails at once, so nothing is sent twice.
 * - timeout: no answer within 30 s, or within `timeoutMs` when a call passes its own (slow work uses SLOW_MS).
 * - unreachable: online, but our server didn't answer (it's down, or a network in between dropped the request).
 * - a server error with no message of its own (a gateway page, an unhandled 500) gets one.
 */
export type NetFailure = "offline" | "timeout" | "unreachable" | "server-down";

export const NET_MESSAGE: Record<NetFailure, string> = {
  offline: "You’re offline. Check your connection: this will work again once you’re back.",
  timeout: "The server took too long to answer. Check your connection and try again.",
  unreachable: "Can’t reach the server right now. Check your connection, or try again in a minute.",
  "server-down": "The server isn’t responding right now. Try again in a minute.",
};

export class NetworkError extends Error {
  constructor(readonly failure: NetFailure) {
    super(NET_MESSAGE[failure]);
    this.name = "NetworkError";
  }
}

const TIMEOUT_MS = 30_000;
/** For calls that legitimately take a while (agent runs, generation). */
export const SLOW_MS = 120_000;
/** Names this client to the Server on every request; the version is baked in at build time (next.config.ts). */
export const CLIENT_TAG = `web/${process.env.WEB_VERSION ?? "dev"}`;
export const requestId = (): string => crypto.randomUUID();
export type SendInit = RequestInit & { timeoutMs?: number };
const WAIT_ONLINE_MS = 60_000;

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** Resolves when the browser is back online, or false after `ms`. */
export function untilOnline(ms = WAIT_ONLINE_MS): Promise<boolean> {
  if (!isOffline()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.removeEventListener("online", on);
      clearTimeout(timer);
      resolve(ok);
    };
    const on = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    window.addEventListener("online", on);
  });
}

export async function send(url: string, init: SendInit = {}, retried = false): Promise<Response> {
  const read = !init.method || init.method === "GET";
  if (isOffline() && !(read && !retried && (await untilOnline()))) throw new NetworkError("offline");
  const { timeoutMs, ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs ?? TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set("X-Client", CLIENT_TAG);
  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  } catch (error) {
    if (init.signal?.aborted) throw error; // the caller cancelled: not a network problem
    if (timeout.aborted) throw new NetworkError("timeout");
    // fetch rejects with a TypeError for any network failure. Went offline mid-request: same as offline above.
    if (isOffline() && read && !retried && (await untilOnline())) return send(url, init, true);
    throw new NetworkError(isOffline() ? "offline" : "unreachable");
  }
  // A server error with no message of its own (a gateway page, or a route that failed before answering): say so.
  if (res.status >= 500 && !res.headers.get("content-type")?.includes("json")) {
    throw new NetworkError("server-down");
  }
  return res;
}
