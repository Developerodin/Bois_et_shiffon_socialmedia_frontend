import { router, useLocalSearchParams } from "expo-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { auth } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { AuthSheet, Legal, SocialSignIn } from "@/ui/onboarding/auth-sheet";
import { holdRegistration } from "@/ui/onboarding/registration";
import { color, space, type } from "@/theme/tokens";

/** Same rule as the server (MIN_PASSWORD_LENGTH in apps/web/server/auth/tokens.ts). */
const MIN_PASSWORD = 12;
type Mode = "code" | "password" | "register";

/**
 * A14 · Onboarding / Email sign in (Figma 408:1073). Three ways in with an email:
 * a 6-digit code (POST /mobile/code), email + password (POST /mobile/password), or a new account with a password,
 * whose email is proven by the same 6-digit code before the account is made (POST /mobile/register → A02).
 */
export default function EmailSignIn() {
  const { t } = useTranslation("onboarding");
  // After a new mobile number is verified: same screen, but it finishes sign-up instead of offering other ways in.
  const linkPhone =
    useLocalSearchParams<{ linkPhone?: string }>().linkPhone === "1";
  const [mode, setMode] = useState<Mode>("code");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid =
    emailOk &&
    (mode === "code" ||
      (mode === "password"
        ? password.length > 0
        : password.length >= MIN_PASSWORD));

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setPassword("");
  };

  async function submit() {
    setSending(true);
    setError(null);
    const address = email.trim();
    try {
      if (mode === "password") {
        await auth.passwordSignIn(address, password);
        return router.replace("/onboarding/welcome");
      }
      if (mode === "register") {
        await auth.register(address, password);
        holdRegistration(address.toLowerCase(), password);
        return router.push({
          pathname: "/onboarding/verify",
          params: { email: address.toLowerCase(), register: "1" },
        });
      }
      await auth.sendCode(address);
      router.push({
        pathname: "/onboarding/verify",
        params: { email: address, ...(linkPhone && { linkPhone: "1" }) },
      });
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? t("email.notConfigured")
          : e instanceof ApiError
            ? e.message
            : t(
                mode === "password" ? "email.signInFailed" : "email.sendFailed",
              ),
      );
    } finally {
      setSending(false);
    }
  }

  const title = linkPhone
    ? t("email.linkTitle")
    : mode === "register"
      ? t("email.registerTitle")
      : t("email.title");
  const subtitle = linkPhone
    ? t("email.linkSubtitle")
    : mode === "password"
      ? t("email.passwordSubtitle")
      : mode === "register"
        ? t("email.registerSubtitle")
        : t("email.subtitle");
  return (
    <AuthSheet title={title} subtitle={subtitle} tagline={t("email.tagline")}>
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
        returnKeyType={mode === "code" ? "send" : "next"}
        onSubmitEditing={() => mode === "code" && valid && void submit()}
        leading={<Mail size={18} color={color.inkMuted} strokeWidth={1.75} />}
      />
      {mode !== "code" ? (
        <View style={{ marginTop: space[12] }}>
          <Field
            label={t("email.passwordLabel")}
            placeholder={
              mode === "register"
                ? t("email.newPasswordPlaceholder", { count: MIN_PASSWORD })
                : t("email.passwordPlaceholder")
            }
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError(null);
            }}
            secureTextEntry={!shown}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            textContentType={mode === "register" ? "newPassword" : "password"}
            returnKeyType="go"
            onSubmitEditing={() => valid && void submit()}
            leading={
              <Lock size={18} color={color.inkMuted} strokeWidth={1.75} />
            }
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  shown ? t("email.hidePassword") : t("email.showPassword")
                }
                onPress={() => setShown((v) => !v)}
                hitSlop={12}
              >
                {shown ? (
                  <EyeOff size={18} color={color.inkMuted} strokeWidth={1.75} />
                ) : (
                  <Eye size={18} color={color.inkMuted} strokeWidth={1.75} />
                )}
              </Pressable>
            }
          />
        </View>
      ) : null}
      <Button
        label={
          mode === "password"
            ? t("email.signIn")
            : mode === "register"
              ? t("email.createAccount")
              : t("common:continue")
        }
        arrow
        disabled={!valid}
        loading={sending}
        style={{ marginTop: space[16] }}
        onPress={() => void submit()}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[type.meta, { color: color.error, paddingTop: space[8] }]}
        >
          {error}
        </Text>
      ) : null}
      {linkPhone ? null : (
        <>
          {mode !== "code" ? (
            <Button
              label={t("email.useCode")}
              variant="ghost"
              height={44}
              style={{ alignSelf: "center", marginTop: space[8] }}
              onPress={() => switchTo("code")}
            />
          ) : null}
          {mode !== "password" ? (
            <Button
              label={t("email.usePassword")}
              variant="ghost"
              height={44}
              style={{ alignSelf: "center", marginTop: space[8] }}
              onPress={() => switchTo("password")}
            />
          ) : null}
          {mode !== "register" ? (
            <Button
              label={t("email.register")}
              variant="ghost"
              height={44}
              style={{ alignSelf: "center" }}
              onPress={() => switchTo("register")}
            />
          ) : null}
          <Button
            label={t("email.useMobile")}
            variant="ghost"
            height={44}
            style={{ alignSelf: "center" }}
            onPress={() => router.back()}
          />
          <SocialSignIn />
        </>
      )}
      <Legal />
    </AuthSheet>
  );
}
