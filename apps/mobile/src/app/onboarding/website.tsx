import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { icons } from "@/ui/icons";
import { Card, Screen, StepHeader, Title } from "@/ui/layout";
import { normalizeWebsite } from "@/ui/onboarding/website";
import { radius, space, type } from "@/theme/tokens";

/** A06 · Onboarding / Website import (Figma 408:344). */
export default function Website() {
  const { t } = useTranslation("onboarding");
  const [address, setAddress] = useState("");
  const site = normalizeWebsite(address);

  return (
    <Screen
      header={<StepHeader step={2} />}
      footer={<Button label={t("common:continue")} arrow disabled={!site} onPress={() => site && router.push({ pathname: "/onboarding/learning", params: { site } })} />}
    >
      <Title title={t("website.title")} subtitle={t("website.subtitle")} />
      <View style={{ paddingBottom: space[20] }}>
        <Field
          label={t("website.label")}
          placeholder={t("website.placeholder")}
          value={address}
          onChangeText={setAddress}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="url"
          returnKeyType="go"
          onSubmitEditing={() => site && router.push({ pathname: "/onboarding/learning", params: { site } })}
          trailing={site ? <Image source={icons.checkCircle} style={{ width: 20, height: 20 }} contentFit="contain" accessibilityLabel={t("website.valid")} /> : null}
        />
      </View>

      {site ? (
        <Card style={{ marginBottom: space[16] }}>
          <View style={styles.foundRow}>
            <View style={styles.badge}>
              <Image source={icons.badgeCheck} style={{ width: 20, height: 20 }} contentFit="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("website.willRead")}</Text>
              <Text style={type.meta} numberOfLines={1}>
                {site.replace(/^https?:\/\//, "")}
              </Text>
            </View>
          </View>
          <View style={styles.facts}>
            {["catalog", "identity", "tone"].map((k) => (
              <View key={k} style={styles.fact}>
                <View style={styles.factKey}>
                  <View style={styles.dot} />
                  <Text style={type.meta}>{t(`website.facts.${k}.key`)}</Text>
                </View>
                <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t(`website.facts.${k}.value`)}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={styles.note}>
        <Image source={icons.lock} style={{ width: 16, height: 16 }} contentFit="contain" />
        <Text style={[type.meta, { flex: 1 }]}>{t("website.safeNote")}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  foundRow: { flexDirection: "row", alignItems: "center", gap: space[12] },
  badge: { width: 32, height: 32, borderRadius: radius.control, backgroundColor: "#F0EFF4", alignItems: "center", justifyContent: "center" },
  facts: { marginTop: space[12], backgroundColor: "#F8F8F9", borderRadius: radius.control, padding: space[12], gap: space[8] },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  factKey: { flexDirection: "row", alignItems: "center", gap: space[8] },
  dot: { width: 6, height: 6, borderRadius: radius.badge, backgroundColor: "#D9D6E1" },
  note: { flexDirection: "row", alignItems: "center", gap: space[8], paddingHorizontal: space[4] },
});
