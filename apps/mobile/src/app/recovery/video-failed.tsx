import { useState } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, RotateCcw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatNumber } from "@/i18n";
import { color, radius, space } from "@/theme/tokens";
import { Footer } from "@/ui/layout";
import { ActionButton, BrandPill, ICON, Panel, Tag, meta, metaInk, strong14 } from "@/ui/reels/kit";
import { ErrorHero, RecoveryTopBar, rx } from "@/ui/recovery/parts";
import { failedReel as reel, photos } from "@/ui/recovery/sample";

/** X01 · Recovery / Video failed. */
export default function VideoFailed() {
  const { t } = useTranslation("recovery");
  const [open, setOpen] = useState(false);
  const credits = { count: reel.credits, n: formatNumber(reel.credits) };
  const details = [
    { key: "failedAt", value: t(`videoFailed.details.stages.${reel.failedStage}`) },
    { key: "reserved", value: t("credits", credits) },
    { key: "released", value: t("credits", credits) },
  ] as const;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/reels"));
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <RecoveryTopBar onBack={back} center={<BrandPill tone="white" />} />
      <ScrollView contentContainerStyle={styles.body}>
        <ErrorHero Icon={CircleAlert} title={t("videoFailed.title")} body={t("videoFailed.body")} />

        <Panel style={styles.reel}>
          <Image source={photos.table} style={styles.thumb} contentFit="cover" accessibilityLabel={t("tableAlt", { product: reel.product })} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.row}>
              <Text style={[strong14, { flex: 1 }]} numberOfLines={1}>
                {reel.title}
              </Text>
              <Tag label={t("videoFailed.failed")} tone="grey" />
            </View>
            <Text style={meta}>{t("videoFailed.facts", { seconds: formatNumber(reel.seconds), count: reel.scenes })}</Text>
            <View style={[styles.row, { gap: space[8], paddingTop: 4 }]}>
              <CircleCheck size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
              <Text style={meta}>{t("videoFailed.released", credits)}</Text>
            </View>
          </View>
        </Panel>

        <Panel style={styles.impact}>
          <View style={[styles.row, styles.impactRow]}>
            <Text style={meta}>{t("videoFailed.impact")}</Text>
            <Text style={metaInk}>{t("videoFailed.used", { count: reel.creditsUsed, n: formatNumber(reel.creditsUsed) })}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            style={[styles.row, styles.details]}
          >
            <Text style={[metaInk, { flex: 1 }]}>{t("videoFailed.viewDetails")}</Text>
            {open ? <ChevronUp size={20} color={color.ink} strokeWidth={ICON.strokeWidth} /> : <ChevronDown size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />}
          </Pressable>
          {open ? (
            <View style={{ gap: space[8], paddingBottom: space[16] }}>
              {details.map((d) => (
                <View key={d.key} style={styles.row}>
                  <Text style={[meta, { flex: 1 }]}>{t(`videoFailed.details.${d.key}`)}</Text>
                  <Text style={metaInk}>{d.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Panel>
      </ScrollView>
      <Footer>
        <ActionButton label={t("videoFailed.tryAgain", credits)} leading={RotateCcw} onPress={() => router.push("/reels/generating")} />
        <ActionButton label={t("videoFailed.editStoryboard")} variant="outline" onPress={() => router.push("/reels/storyboard")} />
      </Footer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rx.page },
  body: { paddingHorizontal: space[20], paddingTop: space[32], paddingBottom: space[24] },
  row: { flexDirection: "row", alignItems: "center" },
  reel: { marginTop: space[32], flexDirection: "row", alignItems: "center", gap: space[16], borderColor: rx.hairline },
  thumb: { width: 64, height: 64, borderRadius: radius.control, borderWidth: 1, borderColor: rx.hairline, backgroundColor: "#EEE" },
  impact: { marginTop: space[16], paddingVertical: 0, borderColor: rx.hairline },
  impactRow: { justifyContent: "space-between", paddingVertical: space[16], borderBottomWidth: 1, borderBottomColor: "#F0EFF4" },
  details: { minHeight: 52 },
});
