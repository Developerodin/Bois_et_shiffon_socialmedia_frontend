import { Image } from "expo-image";
import { router } from "expo-router";
import { getCountryCallingCode, getExampleNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/mobile";
import examples from "libphonenumber-js/mobile/examples";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";
import { ApiError } from "@/api/client";
import { auth } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { icons } from "@/ui/icons";
import { AuthSheet, Legal, SocialSignIn } from "@/ui/onboarding/auth-sheet";
import { CountryPicker, deviceCountry, flag } from "@/ui/onboarding/country-picker";
import { color, space, type } from "@/theme/tokens";

/** A01 · Onboarding / Sign in (Figma 408:2). */
export default function SignIn() {
  const { t } = useTranslation("onboarding");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>(deviceCountry);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // National ("98765 43210", "0151 …") or international ("+44 …") input; a typed +code wins over the picker.
  const parsed = parsePhoneNumberFromString(phone, country);
  const shownCountry = (phone.trim().startsWith("+") && parsed?.country) || country;
  const dial = `+${getCountryCallingCode(shownCountry)}`;

  async function send() {
    if (!parsed?.isValid()) return;
    const e164 = parsed.number;
    setSending(true);
    setError(null);
    try {
      await auth.sendPhoneCode(e164);
      router.push({ pathname: "/onboarding/verify", params: { phone: e164 } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("signIn.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthSheet title={t("signIn.title")} subtitle={t("signIn.subtitle")}>
      <Field
        label={t("signIn.mobileNumber")}
        height={48}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder={getExampleNumber(country, examples)?.formatNational() ?? ""}
        value={phone}
        onChangeText={(text) => {
          setPhone(text);
          setError(null);
        }}
        leading={
          <Pressable accessibilityRole="button" accessibilityLabel={t("signIn.countryCode", { code: dial })} onPress={() => setPicking(true)} hitSlop={8} style={styles.country}>
            <Text style={type.label}>{flag(shownCountry)}</Text>
            <Text style={type.label}>{dial}</Text>
            <Image source={icons.chevronDown} style={{ width: 16, height: 16 }} contentFit="contain" />
          </Pressable>
        }
      />
      <Button
        label={t("signIn.sendCode")}
        arrow
        disabled={!parsed?.isValid()}
        loading={sending}
        style={{ marginTop: space[16] }}
        onPress={() => void send()}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[type.meta, { color: color.error, paddingTop: space[8] }]}>
          {error}
        </Text>
      ) : null}
      <SocialSignIn />
      <Button label={t("signIn.useEmail")} variant="ghost" height={44} style={{ alignSelf: "center", marginTop: space[16] }} onPress={() => router.push("/onboarding/email")} />
      <Legal />
      {/* Development only: Expo Router's list of every screen, for browsing the designs on a phone. */}
      {__DEV__ ? <Button label={t("common:auth.allScreensDev")} variant="ghost" height={44} style={{ alignSelf: "center", marginTop: space[8] }} onPress={() => router.push("/_sitemap")} /> : null}
      <CountryPicker
        visible={picking}
        value={country}
        onClose={() => setPicking(false)}
        onPick={(c) => {
          setCountry(c);
          setPicking(false);
          setError(null);
          // A typed +code would override the new choice, so clear it.
          if (phone.trim().startsWith("+")) setPhone("");
        }}
      />
    </AuthSheet>
  );
}

const styles = StyleSheet.create({
  country: { flexDirection: "row", alignItems: "center", gap: space[8], minHeight: 44, paddingRight: space[4] },
});
