import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from "@expo-google-fonts/inter";
import { router, Stack, usePathname, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "@/i18n";
import { onSignedOut, session } from "@/api/client";
import { me, recordPageView } from "@/api/endpoints";
import { color } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { ConnectionBanner } from "@/ui/connection-banner";
import { ErrorScreen } from "@/ui/error-screen";
import { loadAppLanguage } from "@/ui/language/languages";
import { restoreOnboarding, saveOnboarding } from "@/ui/onboarding/state";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  // Keep the splash up until the saved language is applied, so the first screen isn't shown in the wrong one.
  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    void Promise.all([loadAppLanguage(), restoreOnboarding()]).finally(() => setLanguageReady(true));
    // Leaving the app (e.g. for the Instagram sign-in) is when Android may kill it: save onboarding first.
    const sub = AppState.addEventListener("change", (s) => s === "background" && saveOnboarding());
    return () => sub.remove();
  }, []);
  const ready = (loaded || !!error) && languageReady;

  useEffect(() => {
    // A font failure shouldn't trap people on the splash screen: fall back to the system font.
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // A saved sign-in that stops working (expired, signed out elsewhere): back to sign in, saying why. Onboarding
  // answers are kept, so they continue where they were once signed in again.
  useEffect(() => onSignedOut(() => router.replace({ pathname: "/onboarding/sign-in", params: { expired: "1" } })), []);

  // Is the saved sign-in still good? Asked at launch and whenever the app comes back to the front, so one that
  // stopped working is noticed right away, not on whichever screen next happens to call the server. In the
  // background: offline, it waits and never holds up the app; a 401 goes through onSignedOut above.
  useEffect(() => {
    if (!ready) return; // navigation has to be mounted before it can send anyone to sign in
    const check = () =>
      void session.token().then(async (t) => {
        if (t) await me().catch(() => undefined);
      });
    check();
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, [ready]);

  // Each screen opened, for the admin console's Activity page. Signed-in only; never waited on or retried.
  const path = usePathname();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === path) return;
    sent.current = path;
    void session.token().then((t) => t && recordPageView(path).catch(() => undefined));
  }, [path]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />
      <ConnectionBanner />
    </SafeAreaProvider>
  );
}

/** Any screen that throws while drawing lands here (expo-router: the nearest parent's ErrorBoundary). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => console.error(error), [error]);
  return (
    <SafeAreaProvider>
      <ErrorScreen title={t("crash.title")} body={t("crash.body")}>
        <Button label={t("crash.retry")} onPress={() => void retry()} />
        <Button label={t("notFound.home")} variant="outline" onPress={() => router.replace("/")} />
      </ErrorScreen>
    </SafeAreaProvider>
  );
}
