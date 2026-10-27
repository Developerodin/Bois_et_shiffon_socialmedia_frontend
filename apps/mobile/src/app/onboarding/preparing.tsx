import { Image } from "expo-image";
import { router } from "expo-router";
import { Check, Clapperboard, Clock, Lock, Sparkles } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Aura } from "@/ui/aura";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/layout";
import { sampleProfile } from "@/ui/onboarding/profile";
import { color, radius, space, type } from "@/theme/tokens";

/** A11 · Onboarding / Preparing content (Figma 408:809). */
export default function Preparing() {
  const { t } = useTranslation("onboarding");
  // ponytail: preview timer; with the mobile API this follows the Scout run started at the end of onboarding.
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (step >= 3) return;
    const timer = setTimeout(() => setStep((s) => s + 1), 2200);
    return () => clearTimeout(timer);
  }, [step]);
  const ready = step >= 3;

  return (
    <Screen
      header={
        <>
          <Aura height={480} opacity={0.35} />
          <View style={styles.top}>
            <Text style={[type.meta, { fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 }]}>{t("common:step", { step: 5, total: 5 })}</Text>
            <View style={styles.status}>
              <View style={styles.statusDot} />
              <Text style={type.meta}>{ready ? t("preparing.ready") : t("preparing.preparing")}</Text>
            </View>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: ready ? "100%" : `${55 + step * 10}%` }]} />
          </View>
        </>
      }
      footer={
        <>
          <Button label={ready ? t("common:continue") : t("preparing.loadingButton")} arrow={ready} loading={!ready} disabled={!ready} onPress={() => router.push("/onboarding/connect")} />
          <View style={styles.footNote}>
            <Lock size={12} color={color.inkSecondary} strokeWidth={1.75} />
            <Text style={type.meta}>{t("preparing.catalogSafe")}</Text>
          </View>
        </>
      }
    >
      <View style={styles.hero}>
        <View style={styles.disc}>
          <Image source={require("../../../assets/figma/onboarding/espanda-mark.jpg")} style={{ width: 48, height: 48 }} contentFit="contain" />
        </View>
        <Text style={[type.pageTitle, styles.center, { paddingTop: space[24] }]}>{t("preparing.title")}</Text>
        <Text style={[type.body, styles.center, { color: color.inkSecondary, paddingTop: space[8], maxWidth: 310 }]}>
          {t("preparing.body", { name: sampleProfile.name })}
        </Text>
      </View>

      <View style={styles.list}>
        <Row
          leading={<Image source={sampleProfile.products[0].image} style={styles.thumb} contentFit="cover" />}
          title={t("preparing.photosTitle")}
          detail={t("preparing.photosDetail", { product: "Acacia Bunting" })}
          state={step > 1 ? "done" : "running"}
        />
        <Row
          leading={
            <View style={styles.iconBox}>
              <Clapperboard size={18} color={color.ink} strokeWidth={1.75} />
            </View>
          }
          title={t("preparing.storyboardTitle")}
          detail={t("preparing.storyboardDetail", { count: 3 })}
          state={step > 2 ? "done" : step === 2 ? "running" : "queued"}
          emphasis
        />
        <Row
          leading={
            <View style={[styles.iconBox, { backgroundColor: "transparent", borderWidth: 0 }]}>
              <Sparkles size={18} color={color.inkSecondary} strokeWidth={1.75} />
            </View>
          }
          title={t("preparing.nextTitle")}
          detail={t("preparing.nextDetail")}
          state={ready ? "done" : "queued"}
          muted
        />
      </View>
    </Screen>
  );
}

function Row({ leading, title, detail, state, emphasis, muted }: { leading: React.ReactNode; title: string; detail: string; state: "queued" | "running" | "done"; emphasis?: boolean; muted?: boolean }) {
  return (
    <View style={[styles.row, emphasis && state === "running" && styles.rowActive]}>
      {leading}
      <View style={{ flex: 1 }}>
        <Text style={emphasis && state === "running" ? [type.label, { fontFamily: "Inter_600SemiBold" }] : [type.meta, { color: muted ? color.inkSecondary : color.ink }]}>{title}</Text>
        <Text style={type.meta}>{detail}</Text>
      </View>
      {state === "done" ? (
        <View style={styles.done}>
          <Check size={14} color={color.onPrimary} strokeWidth={2.5} />
        </View>
      ) : state === "running" ? (
        <ActivityIndicator size={14} color={color.ink} />
      ) : (
        <Clock size={16} color={color.inkSecondary} strokeWidth={1.75} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[20], paddingTop: space[12] },
  status: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space[4], paddingHorizontal: space[12], backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, borderRadius: radius.round },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.ink },
  track: { height: 4, marginHorizontal: space[20], marginTop: space[12], borderRadius: 999, backgroundColor: color.divider, overflow: "hidden" },
  bar: { height: 4, borderRadius: 999, backgroundColor: color.primary },
  hero: { alignItems: "center", paddingTop: space[32], paddingBottom: space[32] },
  disc: { width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: color.divider, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  center: { textAlign: "center" },
  list: { padding: space[12], gap: space[8], backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: color.divider, borderRadius: radius.card },
  row: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[8], borderRadius: radius.control },
  rowActive: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, padding: space[12] },
  thumb: { width: 36, height: 36, borderRadius: radius.control, borderWidth: 1, borderColor: color.divider },
  iconBox: { width: 36, height: 36, borderRadius: radius.nested, alignItems: "center", justifyContent: "center", backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider },
  done: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#101014", alignItems: "center", justifyContent: "center" },
  footNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
