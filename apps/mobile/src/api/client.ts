import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import i18n from "@/i18n";

/**
 * API client for the web backend (apps/web /api/v1). Auth is a Bearer token from /mobile/session,
 * kept in the device keychain (SecureStore); the web preview falls back to localStorage.
 * Set EXPO_PUBLIC_API_URL to the machine's LAN address when testing on a phone (localhost is the phone).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3100").replace(/\/$/, "");
const TOKEN_KEY = "espanda.session";

const store = {
  get: () => (Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.getItem(TOKEN_KEY) ?? null) : SecureStore.getItemAsync(TOKEN_KEY)),
  set: (v: string) => (Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.setItem(TOKEN_KEY, v)) : SecureStore.setItemAsync(TOKEN_KEY, v)),
  clear: () => (Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.removeItem(TOKEN_KEY)) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

export const session = {
  token: () => store.get(),
  save: (token: string) => store.set(token),
  signOut: () => store.clear(),
};

/** Error with the server's problem+json `detail`, safe to show to people. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Whether Espanda's server can be reached. We test the server itself, not the phone's network: that covers no
 * signal, Wi-Fi without internet, and the server being down, without a native network module.
 * Set "offline" when a request can't get through; then the server is tried every 5 s until it answers.
 */
type Connection = "online" | "offline";
let connectionState: Connection = "online";
const connectionListeners = new Set<(c: Connection) => void>();
const setConnection = (c: Connection) => {
  if (c === connectionState) return;
  connectionState = c;
  connectionListeners.forEach((fn) => fn(c));
};
export const connection = {
  current: () => connectionState,
  subscribe: (fn: (c: Connection) => void) => (connectionListeners.add(fn), () => void connectionListeners.delete(fn)),
};

const PROBE_MS = 5_000;
let probing = false;
async function probeUntilReachable() {
  if (probing) return;
  probing = true;
  while (connectionState === "offline") {
    await new Promise((r) => setTimeout(r, PROBE_MS));
    // Any answer at all (even "sign in required") means the server is reachable.
    if (await withTimeout(PROBE_MS, (signal) => fetch(`${API_URL}/api/v1/me`, { signal })).then(() => true, () => false)) setConnection("online");
  }
  probing = false;
}

/** Resolves true once the server is reachable again, or false after `ms`. */
function untilReachable(ms: number): Promise<boolean> {
  if (connectionState === "online") return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => (off(), resolve(false)), ms);
    const off = connection.subscribe((c) => c === "online" && (clearTimeout(timer), off(), resolve(true)));
  });
}

/** Runs `run` with a signal that aborts after `ms` (React Native has no AbortSignal.timeout). */
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>, outer?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const cancel = () => ctrl.abort();
  outer?.addEventListener("abort", cancel);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", cancel);
  }
}

/** Someone's saved sign-in stopped working (expired, or signed out elsewhere): the app sends them to sign in. */
const signedOutListeners = new Set<() => void>();
export const onSignedOut = (fn: () => void) => (signedOutListeners.add(fn), () => void signedOutListeners.delete(fn));

const TIMEOUT_MS = 20_000;
const WAIT_FOR_SERVER_MS = 60_000;

/**
 * One call to the API. Network trouble gives a translated message (status 0): can't reach the server, too slow,
 * or the server not responding. A read (GET) that can't get through waits for the server, up to a minute, and
 * tries once more; a write never repeats by itself, so nothing is sent twice.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown; workspaceId?: string; signal?: AbortSignal } = {}, retried = false): Promise<T> {
  const method = init.method ?? (init.body ? "POST" : "GET");
  const token = await store.get();
  let res: Response;
  try {
    res = await withTimeout(
      TIMEOUT_MS,
      (signal) =>
        fetch(`${API_URL}/api/v1${path}`, {
          method,
          signal,
          headers: {
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(init.workspaceId ? { "X-Workspace-Id": init.workspaceId } : {}),
          },
          body: init.body ? JSON.stringify(init.body) : undefined,
        }),
      init.signal,
    );
  } catch (error) {
    if (init.signal?.aborted) throw error; // the screen cancelled it: not a network problem
    const timedOut = error instanceof Error && error.name === "AbortError";
    if (!timedOut) {
      setConnection("offline");
      void probeUntilReachable();
      if (method === "GET" && !retried && (await untilReachable(WAIT_FOR_SERVER_MS))) return api<T>(path, init, true);
    }
    throw new ApiError(0, i18n.t(timedOut ? "common:net.timeout" : "common:net.unreachable"));
  }
  setConnection("online");
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A server error with no message of its own (a gateway page, a route that failed before answering).
    if (res.status >= 500 && !data) throw new ApiError(res.status, i18n.t("common:net.serverDown"));
    if (res.status === 401 && token) {
      await store.clear();
      signedOutListeners.forEach((fn) => fn());
    }
    throw new ApiError(res.status, data?.detail ?? data?.title ?? i18n.t("common:net.failed"));
  }
  return data as T;
}
