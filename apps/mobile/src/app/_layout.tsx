import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "@/i18n";
import { color } from "@/theme/tokens";
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

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />
    </SafeAreaProvider>
  );
}
