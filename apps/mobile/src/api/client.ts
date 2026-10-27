import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

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

export async function api<T>(path: string, init: { method?: string; body?: unknown; workspaceId?: string; signal?: AbortSignal } = {}): Promise<T> {
  const token = await store.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      signal: init.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.workspaceId ? { "X-Workspace-Id": init.workspaceId } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach Espanda. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) await store.clear();
    throw new ApiError(res.status, data?.detail ?? data?.title ?? "Something went wrong. Try again.");
  }
  return data as T;
}
