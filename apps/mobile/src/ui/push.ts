import Constants from "expo-constants";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "@/api/client";
import i18n from "@/i18n";

/**
 * Push notifications ("your reel is ready" / "couldn't be made") through Expo's push service.
 * Off until the app has an EAS project (`eas init` puts extra.eas.projectId in app.json) and Android has Firebase
 * (google-services.json): until then every function here does nothing and the in-app ReadyBanner covers it.
 * expo-notifications has native code: builds made before it was added can't load it, so it's required lazily.
 * ponytail: the texts are registered in the app's language at the time; changing language re-registers on the next
 * Make video.
 */
type Notifications = typeof import("expo-notifications");
let token: string | null = null;

const projectId = () => (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
function load(): Notifications | null {
  if (Platform.OS === "web" || !projectId()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as Notifications;
  } catch {
    return null; // a build without the native module
  }
}

/** True once this phone gets push notifications: the in-app banner then stays quiet so nothing shows twice. */
export const pushActive = () => token !== null;

/** Asks once (on the first Make video, not at launch) and registers this phone with the texts in its language. */
export async function enablePush() {
  const N = load();
  if (!N) return;
  try {
    if (Platform.OS === "android") await N.setNotificationChannelAsync("reels", { name: i18n.t("reels:push.channel"), importance: N.AndroidImportance.DEFAULT });
    const perm = await N.getPermissionsAsync();
    const granted = perm.granted || (perm.canAskAgain && (await N.requestPermissionsAsync()).granted);
    if (!granted) return;
    const t = (await N.getExpoPushTokenAsync({ projectId: projectId() })).data;
    // "{title}" stays a placeholder: the server fills in the reel's name when it sends.
    const text = (key: string) => i18n.t(`reels:push.${key}`, { title: "{title}" });
    await api("/mobile/push-device", {
      body: { token: t, platform: Platform.OS, messages: { ready: { title: text("readyTitle"), body: text("readyBody") }, failed: { title: text("failedTitle"), body: text("failedBody") } } },
    });
    token = t;
  } catch {
    // Push is a bonus: it never stops a video from being made.
  }
}

/** Signing out: this phone stops getting that person's notifications. */
export async function disablePush() {
  if (!token) return;
  const t = token;
  token = null;
  await api("/mobile/push-device", { method: "DELETE", body: { token: t } }).catch(() => undefined);
}

/** A tapped notification (app open, in the background, or started by the tap) opens that reel. */
export function useNotificationOpens(open: (reelId: string, ok: boolean) => void) {
  useEffect(() => {
    const N = load();
    if (!N) return;
    N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
    const handle = (r: { notification: { request: { content: { data?: unknown } } } }) => {
      const data = r.notification.request.content.data as { reelId?: unknown; ok?: unknown } | undefined;
      if (typeof data?.reelId === "string") open(data.reelId, data.ok === true);
    };
    void N.getLastNotificationResponseAsync().then((r) => r && handle(r));
    const sub = N.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [open]);
}
