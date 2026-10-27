import { useState, type ReactNode } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Trans, useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TurboModuleRegistry, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import { auth } from "@/api/endpoints";
import { Aura } from "@/ui/aura";
import { Button } from "@/ui/button";
import { icons, images } from "@/ui/icons";
import { color, radius, space, type } from "@/theme/tokens";

/** Shared shell of A01 (mobile) and A14 (email): logo on the aura, white sheet with the form. */
export function AuthSheet({ title, subtitle, tagline, children }: { title: string; subtitle: string; tagline?: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Aura height={320} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={styles.hero}>
            <Image source={images.logo} style={styles.logo} contentFit="contain" accessibilityLabel="Espanda" />
            {tagline ? <Text style={[type.meta, { paddingTop: space[12] }]}>{tagline}</Text> : null}
          </View>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={type.pageTitle}>{title}</Text>
            <Text style={[type.meta, { paddingTop: space[4], paddingBottom: space[20] }]}>{subtitle}</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "or continue with" rule + Google / Apple buttons. */
export function SocialSignIn() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function google() {
    // The native Google module only exists in our own app build, not in Expo Go or the web preview.
    if (Platform.OS === "web" || !TurboModuleRegistry.get("RNGoogleSignin")) return setError(t("auth.googleNeedsBuild"));
    setError(null);
    setBusy(true);
    try {
      const { GoogleSignin, isSuccessResponse } = await import("@react-native-google-signin/google-signin");
      // webClientId makes Google issue the ID token for our server (GOOGLE_CLIENT_ID in apps/web/.env).
      GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID });
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res)) return; // closed the Google sheet
      if (!res.data.idToken) throw new Error("no idToken");
      await auth.google(res.data.idToken);
      router.replace("/onboarding/welcome");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("auth.googleFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text style={[type.meta, { paddingHorizontal: space[12] }]}>{t("auth.orContinueWith")}</Text>
        <View style={styles.rule} />
      </View>
      <View style={styles.socials}>
        <Button label={t("auth.google")} variant="outline" icon={icons.google} loading={busy} style={{ flex: 1 }} onPress={() => void google()} />
        <Button label={t("auth.apple")} variant="outline" icon={icons.apple} style={{ flex: 1 }} onPress={() => router.push("/onboarding/welcome")} />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[type.meta, { paddingTop: space[8], color: color.error }]}>
          {error}
        </Text>
      ) : null}
    </>
  );
}

export function Legal() {
  const { t } = useTranslation();
  return (
    <Text style={[type.meta, { textAlign: "center", paddingTop: space[12], paddingHorizontal: space[4] }]}>
      <Trans t={t} i18nKey="auth.legal" components={{ terms: <Text style={{ color: color.ink }} />, privacy: <Text style={{ color: color.ink }} /> }} />
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvasAlt },
  hero: { height: 300, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  logo: { width: 240, height: 70 },
  sheet: {
    flexGrow: 1,
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderTopWidth: 1,
    borderColor: "rgba(232,231,237,0.6)",
    paddingTop: 28,
    paddingHorizontal: space[24],
    paddingBottom: space[32],
    shadowColor: "#101014",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -12 },
    elevation: 4,
  },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: radius.control, backgroundColor: color.disabledBg, marginBottom: space[20] },
  divider: { flexDirection: "row", alignItems: "center", paddingVertical: space[16] },
  rule: { flex: 1, height: 1, backgroundColor: color.divider },
  socials: { flexDirection: "row", gap: space[16] },
});
