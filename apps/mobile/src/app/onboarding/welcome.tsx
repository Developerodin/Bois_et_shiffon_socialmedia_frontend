import { Image } from "expo-image";
import { router } from "expo-router";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { images } from "@/ui/icons";
import { Screen } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";

// Keys under onboarding:welcome.steps.<key>.title / .body.
const STEPS = ["goal", "business", "review"] as const;

/** A03 · Onboarding / Welcome (Figma 408:109). */
export default function Welcome() {
  const { t } = useTranslation("onboarding");
  return (
    <Screen
      footer={
        <>
          <Button label={t("welcome.getStarted")} arrow onPress={() => router.push("/onboarding/goal")} />
          <Text style={[type.meta, { textAlign: "center" }]}>{t("welcome.footnote")}</Text>
        </>
      }
    >
      <View style={styles.top}>
        <Image source={images.logo} style={{ width: 96, height: 28 }} contentFit="contain" accessibilityLabel="Espanda" />
        {/* Two catalog shots, slightly tilted as in the design. */}
        <View style={styles.photos} accessibilityLabel={t("welcome.photosLabel")}>
          <Image source={require("../../../assets/figma/onboarding/bunting-dining-room.png")} style={styles.photo} contentFit="cover" />
          <Image source={require("../../../assets/figma/onboarding/bunting-living-room.png")} style={[styles.photo, { marginTop: 10 }]} contentFit="cover" />
        </View>
        <Text style={[type.pageTitle, styles.center, { paddingTop: 6, paddingHorizontal: space[16] }]}>{t("welcome.title")}</Text>
        <Text style={[type.body, styles.center, { color: color.inkSecondary, paddingTop: space[8], maxWidth: 280 }]}>
          {t("welcome.body")}
        </Text>
      </View>

      <View style={styles.steps}>
        {STEPS.map((key, i) => (
          <Fragment key={key}>
            {i > 0 && <View style={styles.rule} />}
            <View style={styles.step}>
              <View style={styles.num}>
                <Text style={[type.meta, { color: color.ink }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t(`welcome.steps.${key}.title`)}</Text>
                <Text style={[type.meta, { paddingTop: 2 }]}>{t(`welcome.steps.${key}.body`)}</Text>
              </View>
            </View>
          </Fragment>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", paddingTop: 12, paddingBottom: space[12] },
  photos: { flexDirection: "row", gap: space[8], paddingTop: space[12], paddingBottom: space[20], transform: [{ rotate: "-2deg" }] },
  photo: {
    width: 167,
    height: 170,
    borderRadius: radius.control,
    backgroundColor: color.surface,
    shadowColor: "#27222C",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  center: { textAlign: "center" },
  steps: {
    marginTop: space[24],
    padding: space[20],
    borderRadius: radius.control,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  step: { flexDirection: "row", gap: space[16], alignItems: "flex-start" },
  num: { width: 32, height: 32, borderRadius: radius.control, backgroundColor: "rgba(16,16,20,0.05)", alignItems: "center", justifyContent: "center", marginTop: 2 },
  rule: { height: 1, backgroundColor: "rgba(0,0,0,0.04)", marginLeft: 48, marginVertical: space[16] },
});
