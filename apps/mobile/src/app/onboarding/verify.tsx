import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import { ApiError } from "@/api/client";
import { auth } from "@/api/endpoints";
import { signedInHome } from "@/ui/account-actions";
import { clearRegistration, registrationFor } from "@/ui/onboarding/registration";
import { onboarding } from "@/ui/onboarding/state";
import { Glow } from "@/ui/aura";
import { Button } from "@/ui/button";
import { resetTo } from "@/ui/reset-stack";
import { images } from "@/ui/icons";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";

const LENGTH = 6;
const RESEND_S = 42;

/** A02 · Onboarding / Verify code (Figma 408:74). */
export default function Verify() {
  const { t } = useTranslation("onboarding");
  const { phone = "", email, linkPhone, register } = useLocalSearchParams<{ phone?: string; email?: string; linkPhone?: string; register?: string }>();
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(RESEND_S);
  const input = useRef<TextInputInstance>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      if (email && register === "1") {
        // "Create an account": the code proves the email, then the account is made with the password typed before.
        const password = registrationFor(email);
        if (!password) return router.replace("/onboarding/email"); // app restarted in between: ask again
        await auth.verifyRegistration(email, code, password);
        clearRegistration();
      } else if (email) {
        // Only the "add your email" step carries the number; a plain email sign-in never fails on an old ticket.
        await auth.verify(email, code, linkPhone === "1" ? onboarding.phoneTicket : undefined);
        onboarding.phoneTicket = undefined;
      } else {
        const pending = await auth.verifyPhone(phone, code);
        // New number: the account still needs an email, verified the usual way.
        if (pending) {
          onboarding.phoneTicket = pending.phoneTicket;
          return router.replace({ pathname: "/onboarding/email", params: { linkPhone: "1" } });
        }
      }
      resetTo(await signedInHome());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("verify.checkFailed"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setLeft(RESEND_S);
    setError(null);
    await (email ? auth.sendCode(email) : auth.sendPhoneCode(phone)).catch((e: unknown) => setError(e instanceof ApiError ? e.message : t("verify.resendFailed")));
  }

  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  // "+91 9876543210" → "+91 ••••• 43210", as in the design.
  const masked = email ?? phone.replace(/(\d+)(\d{5})$/, (_, a: string, b: string) => `${"•".repeat(Math.min(5, a.length))} ${b}`);

  return (
    <Screen
      header={
        <>
          <Glow />
          <StepHeader center={<Image source={images.logo} style={{ width: 96, height: 28 }} contentFit="contain" accessibilityLabel="Espanda" />} />
        </>
      }
      footer={<Button label={t("verify.submit")} arrow disabled={code.length < LENGTH} loading={busy} onPress={() => void verify()} />}
    >
      <Title title={t("verify.title")} subtitle={t("verify.sent", { destination: masked })} style={{ paddingBottom: space[32] }} />

      {/* One real input drives six boxes, so paste and SMS autofill work. */}
      <Pressable onPress={() => input.current?.focus()} accessibilityLabel={t("verify.codeLabel")} style={styles.boxes}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <View key={i} style={[styles.box, i === code.length && styles.boxActive]}>
            <Text style={styles.digit}>{code[i] ?? ""}</Text>
          </View>
        ))}
        <TextInput
          ref={input}
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={LENGTH}
          style={styles.hidden}
        />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={[type.meta, { color: color.error, paddingTop: space[12] }]}>
          {error}
        </Text>
      ) : null}

      <View style={{ alignItems: "center", gap: space[12], paddingTop: space[24] }}>
        {left > 0 ? (
          <Text style={type.meta}>{t("verify.resendIn", { time: `00:${String(left).padStart(2, "0")}` })}</Text>
        ) : (
          <Button label={t("verify.resend")} variant="ghost" height={44} onPress={() => void resend()} />
        )}
        <Button label={email ? t("verify.changeEmail") : t("verify.changeMobile")} variant="ghost" height={44} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: "row", justifyContent: "space-between" },
  box: { width: 50, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: color.controlOutline, backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  boxActive: { borderColor: color.primary, borderWidth: 2 },
  digit: { fontFamily: "Inter_600SemiBold", fontSize: 22, color: color.ink },
  hidden: { position: "absolute", opacity: 0, width: 1, height: 1 },
});
