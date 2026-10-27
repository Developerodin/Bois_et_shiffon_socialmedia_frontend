import { router, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Aura } from "@/ui/aura";
import { Button } from "@/ui/button";
import { images } from "@/ui/icons";
import { Screen, StepHeader } from "@/ui/layout";
import { SpinnerMark } from "@/ui/onboarding/spinner-mark";
import { useResearch } from "@/ui/onboarding/use-research";
import { color, radius, space, type } from "@/theme/tokens";

type Stage = "queued" | "running" | "done";
// Keys under onboarding:learning.stages.
const STAGES = ["open", "identity", "photos"] as const;

/** A08 · Onboarding / Learning your business (Figma 408:478). */
export default function Learning() {
  const { t } = useTranslation("onboarding");
  const { site, name } = useLocalSearchParams<{ site?: string; name?: string }>();
  const host = site ? site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") : name ?? t("learning.fallbackName");

  const { step: done, failed, retry } = useResearch(site);
  const stage = (i: number): Stage => (i < done ? "done" : i === done && !failed ? "running" : "queued");
  const finished = done >= STAGES.length;

  return (
    <Screen
      header={
        <>
          <Aura height={420} opacity={0.35} />
          <StepHeader step={3} pill />
        </>
      }
      footer={
        <>
          {failed ? (
            <>
              <Text accessibilityRole="alert" style={[type.meta, { color: color.error, textAlign: "center" }]}>
                {failed}
              </Text>
              <Button label={t("learning.tryAgain")} onPress={() => void retry()} />
            </>
          ) : finished ? (
            <Button label={t("common:continue")} arrow onPress={() => router.replace({ pathname: "/onboarding/review", params: { site: site ?? "", name: name ?? "" } })} />
          ) : (
            <Button label={t("learning.inProgressButton")} loading disabled />
          )}
          <Text style={[type.meta, { textAlign: "center" }]}>{t("learning.saved")}</Text>
        </>
      }
    >
      <View style={styles.hero}>
        <SpinnerMark />
        <Text style={[type.pageTitle, styles.center, { paddingTop: space[24], paddingHorizontal: space[8] }]}>{t("learning.title")}</Text>
        <Text style={[type.body, styles.center, { color: color.inkSecondary, paddingTop: space[8], maxWidth: 290 }]}>
          {site ? t("learning.bodyWebsite") : t("learning.bodyManual")}
        </Text>
      </View>

      <View style={[styles.card, styles.source]}>
        <View style={styles.sourceLeft}>
          <Image source={images.bcFavicon} style={styles.favicon} contentFit="contain" />
          <View>
            <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
              {host}
            </Text>
            <Text style={[type.meta, { paddingTop: 2 }]}>{site ? t("learning.sourceWebsite") : t("learning.sourceManual")}</Text>
          </View>
        </View>
        <View style={styles.found}>
          <View style={styles.foundDot} />
          <Text style={[type.meta, { color: color.ink }]}>{site ? t("learning.foundWebsite") : t("learning.foundManual")}</Text>
        </View>
      </View>

      <View style={[styles.card, { gap: space[16], padding: space[16] }]} accessibilityLiveRegion="polite">
        {STAGES.map((key, i) => {
          const s = stage(i);
          return (
            <Fragment key={key}>
              {i > 0 && <View style={styles.rule} />}
              <View style={styles.stage}>
                <View style={styles.stageLeft}>
                  <View style={[styles.stageIcon, s === "done" ? styles.iconDone : s === "running" ? styles.iconRunning : styles.iconQueued]}>
                    {s === "done" ? <Check size={14} color={color.onPrimary} strokeWidth={2.5} /> : s === "running" ? <ActivityIndicator size={12} color={color.ink} /> : <View style={styles.queuedDot} />}
                  </View>
                  <Text style={s === "running" ? [type.label, { fontFamily: "Inter_600SemiBold" }] : [type.meta, { color: s === "done" ? color.ink : color.inkSecondary }]}>{t(`learning.stages.${key}`)}</Text>
                </View>
                <Text style={[type.meta, s === "running" && { color: color.ink }]}>{t(`learning.status.${s}`)}</Text>
              </View>
            </Fragment>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingTop: space[32], paddingBottom: space[24] },
  center: { textAlign: "center" },
  card: { backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: color.divider, borderRadius: 20, marginBottom: space[12] },
  source: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space[16], borderRadius: 18 },
  sourceLeft: { flexDirection: "row", alignItems: "center", gap: space[12], flexShrink: 1 },
  favicon: { width: 16, height: 16, borderWidth: 1, borderColor: color.divider },
  found: { flexDirection: "row", alignItems: "center", gap: space[8], paddingVertical: space[4], paddingHorizontal: space[12], backgroundColor: "#F4F2FD", borderWidth: 1, borderColor: "#E2E1EB", borderRadius: radius.control },
  foundDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#101014" },
  stage: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 24 },
  stageLeft: { flexDirection: "row", alignItems: "center", gap: space[12], flexShrink: 1 },
  stageIcon: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconDone: { backgroundColor: "#101014" },
  iconRunning: { backgroundColor: "#F4F2FD", borderWidth: 1, borderColor: "#C6C5D2" },
  iconQueued: { backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider },
  queuedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#797983" },
  rule: { height: 1, backgroundColor: "rgba(232,231,237,0.7)" },
});
