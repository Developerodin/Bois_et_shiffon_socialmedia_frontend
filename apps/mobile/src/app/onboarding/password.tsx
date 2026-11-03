import { router, useLocalSearchParams } from "expo-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { auth } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { resetTo } from "@/ui/reset-stack";
import { Field } from "@/ui/field";
import { AuthSheet, Legal } from "@/ui/onboarding/auth-sheet";
import { holdRegistration } from "@/ui/onboarding/registration";
import { color, space, type } from "@/theme/tokens";

/** Same rule as the server (MIN_PASSWORD_LENGTH in apps/web/server/auth/tokens.ts). */
const MIN_PASSWORD = 12;

/**
 * After the email screen (A14): the password for an account that has one, or — `create=1`, a new email —
 * the password for a new account, confirmed by a 6-digit code on A02 before the account is made.
 */
export default function PasswordStep() {
  const { t } = useTranslation("onboarding");
  const { email = "", create } = useLocalSearchParams<{ email?: string; create?: string }>();
  const isNew = create === "1";
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState<"submit" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = isNew ? password.length >= MIN_PASSWORD : password.length > 0;

  async function run(kind: "submit" | "code") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "code") {
        await auth.sendCode(email);
        return router.push({ pathname: "/onboarding/verify", params: { email } });
      }
      if (isNew) {
        await auth.register(email, password);
        holdRegistration(email, password);
        return router.push({ pathname: "/onboarding/verify", params: { email, register: "1" } });
      }
      await auth.passwordSignIn(email, password);
      resetTo("/onboarding/welcome");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 503 ? t("email.notConfigured") : e instanceof ApiError ? e.message : t(isNew || kind === "code" ? "email.sendFailed" : "email.signInFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthSheet title={isNew ? t("email.registerTitle") : t("password.title")} subtitle={isNew ? t("email.registerSubtitle") : t("password.subtitle")} tagline={t("email.tagline")}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("password.changeEmail", { email })} onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: space[8], minHeight: 44 }}>
        <Mail size={18} color={color.inkMuted} strokeWidth={1.75} />
        <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
          {email}
        </Text>
        <Text style={[type.label, { color: color.primary }]}>{t("password.change")}</Text>
      </Pressable>
      <View style={{ marginTop: space[8] }}>
        <Field
          label={t("email.passwordLabel")}
          placeholder={isNew ? t("email.newPasswordPlaceholder", { count: MIN_PASSWORD }) : t("email.passwordPlaceholder")}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setError(null);
          }}
          autoFocus
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isNew ? "new-password" : "current-password"}
          textContentType={isNew ? "newPassword" : "password"}
          returnKeyType="go"
          onSubmitEditing={() => valid && void run("submit")}
          leading={<Lock size={18} color={color.inkMuted} strokeWidth={1.75} />}
          trailing={
            <Pressable accessibilityRole="button" accessibilityLabel={shown ? t("email.hidePassword") : t("email.showPassword")} onPress={() => setShown((v) => !v)} hitSlop={12}>
              {shown ? <EyeOff size={18} color={color.inkMuted} strokeWidth={1.75} /> : <Eye size={18} color={color.inkMuted} strokeWidth={1.75} />}
            </Pressable>
          }
        />
      </View>
      <Button
        label={isNew ? t("email.createAccount") : t("email.signIn")}
        arrow
        disabled={!valid || !!busy}
        loading={busy === "submit"}
        style={{ marginTop: space[16] }}
        onPress={() => void run("submit")}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[type.meta, { color: color.error, paddingTop: space[8] }]}>
          {error}
        </Text>
      ) : null}
      {isNew ? null : (
        <Button
          label={t("password.useCode")}
          variant="ghost"
          height={44}
          loading={busy === "code"}
          disabled={!!busy}
          style={{ alignSelf: "center", marginTop: space[8] }}
          onPress={() => void run("code")}
        />
      )}
      <Legal />
    </AuthSheet>
  );
}
