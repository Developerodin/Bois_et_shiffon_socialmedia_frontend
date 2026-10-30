import { router, useLocalSearchParams } from "expo-router";
import { Mail } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { ApiError } from "@/api/client";
import { auth } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { AuthSheet, Legal, SocialSignIn } from "@/ui/onboarding/auth-sheet";
import { color, space, type } from "@/theme/tokens";

/**
 * A14 · Onboarding / Email sign in (Figma 408:1073). Email first; the server says what comes next:
 * an account with a password → the password screen; one without (email code, phone, Google) → a 6-digit code;
 * a new email → the password screen in "create your account" mode, confirmed by a code.
 */
export default function EmailSignIn() {
  const { t } = useTranslation("onboarding");
  // After a new mobile number is verified: same screen, but it finishes sign-up by email code only.
  const linkPhone = useLocalSearchParams<{ linkPhone?: string }>().linkPhone === "1";
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function sendCode(address: string) {
    await auth.sendCode(address);
    router.push({ pathname: "/onboarding/verify", params: { email: address, ...(linkPhone && { linkPhone: "1" }) } });
  }

  async function next() {
    setSending(true);
    setError(null);
    const address = email.trim().toLowerCase();
    try {
      if (linkPhone) return await sendCode(address);
      const { next: step } = await auth.emailStep(address);
      if (step === "code") return await sendCode(address);
      router.push({ pathname: "/onboarding/password", params: { email: address, ...(step === "register" && { create: "1" }) } });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 503 ? t("email.notConfigured") : e instanceof ApiError ? e.message : t("email.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthSheet title={linkPhone ? t("email.linkTitle") : t("email.title")} subtitle={linkPhone ? t("email.linkSubtitle") : t("email.subtitleEmailFirst")} tagline={t("email.tagline")}>
      <Field
        label={t("email.label")}
        placeholder={t("email.placeholder")}
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setError(null);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => valid && void next()}
        leading={<Mail size={18} color={color.inkMuted} strokeWidth={1.75} />}
      />
      <Button label={t("common:continue")} arrow disabled={!valid} loading={sending} style={{ marginTop: space[16] }} onPress={() => void next()} />
      {error ? (
        <Text accessibilityRole="alert" style={[type.meta, { color: color.error, paddingTop: space[8] }]}>
          {error}
        </Text>
      ) : null}
      {linkPhone ? null : (
        <>
          <Button label={t("email.useMobile")} variant="ghost" height={44} style={{ alignSelf: "center", marginTop: space[16] }} onPress={() => router.back()} />
          <SocialSignIn />
        </>
      )}
      <Legal />
    </AuthSheet>
  );
}
