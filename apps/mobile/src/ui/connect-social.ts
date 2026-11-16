import * as WebBrowser from "expo-web-browser";
import { ApiError } from "@/api/client";
import { completeSocialConnect, startSocialConnect, type SocialProvider } from "@/api/endpoints";
import i18n from "@/i18n";

const RETURN_URL = "espanda://connect";

/**
 * True while this app's own consent browser is open, and the `state` it completed: the return link may also reach the
 * router (app/connect.tsx), which must then leave it to connectSocial instead of completing it a second time.
 */
let open = false;
let completedState: string | null = null;
export const ownedByConnectSocial = (state: string | undefined) => open || (!!state && state === completedState);

/**
 * Connects (or reconnects) Instagram or Facebook Pages for a brand: the server's consent page opens in the in-app
 * browser, which comes back to RETURN_URL with state + code; the app then completes with its own token (the server
 * checks it's the same person). A reconnect updates the existing account (apps/web connections.ts upserts it).
 * Resolves to the connected account names, [] when the person closed the browser. Throws a readable message.
 * Used by A12 (onboarding) and X03 (reconnect).
 */
export async function connectSocial(ws: string, brandId: string, provider: SocialProvider): Promise<string[]> {
  try {
    const { url } = await startSocialConnect(ws, brandId, provider);
    open = true;
    const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
    if (result.type !== "success") return [];
    const back = new URL(result.url).searchParams;
    const [slug, state, code] = [back.get("provider"), back.get("state"), back.get("code")];
    if (!slug || !state || !code) throw new Error(i18n.t("onboarding:connect.errors.cancelled"));
    completedState = state;
    return (await completeSocialConnect(slug, state, code)).connected;
  } catch (e) {
    throw new Error(e instanceof ApiError || e instanceof Error ? e.message : i18n.t("onboarding:connect.errors.failed"));
  } finally {
    open = false;
  }
}
