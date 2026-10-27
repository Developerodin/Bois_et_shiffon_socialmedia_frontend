import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, Coins, Lock, Sparkles } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatNumber } from "@/i18n";
import { color, radius, space, type } from "@/theme/tokens";
import { CloseButton } from "@/ui/plans/kit";
import { pendingReel as reel, photos, product } from "@/ui/plans/sample";
import { ActionButton, ICON, Tag } from "@/ui/reels/kit";
import { Sheet } from "@/ui/recovery/sheet";

/** L02 · No subscription / Generation gate — sheet over the (blurred) studio. */
export default function GenerationGate() {
  const { t } = useTranslation("plans");
  const { top } = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/reels/storyboard"));
  return (
    <View style={{ flex: 1, backgroundColor: "#F6F5F9" }}>
      <View style={[styles.bar, { paddingTop: top + space[12] }]}>
        <View style={styles.dot} />
        <Text style={[type.label, { flex: 1 }]}>Espanda Studio</Text>
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ gap: space[16], padding: space[20] }}>
        {[photos.tableStaged, photos.catalogBlur].map((src, i) => (
          <View key={i} style={styles.ghost}>
            <Image source={src} blurRadius={8} style={styles.ghostThumb} contentFit="cover" />
            <View style={{ flex: 1, gap: space[12] }}>
              <View style={[styles.ghostLine, { width: "60%" }]} />
              <View style={[styles.ghostLine, { width: "90%", height: 12 }]} />
              <View style={[styles.ghostLine, { width: "75%" }]} />
            </View>
          </View>
        ))}
      </View>

      <Sheet onClose={close} scrim="rgba(190,189,197,0.75)" bg="#FBFAFD" gutter={space[20]} label={t("gate.sheetLabel")}>
        <View style={styles.head}>
          <View style={styles.spark}>
            <Sparkles size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </View>
          <View style={styles.pill}>
            <Lock size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
            <Text style={[type.body, { color: color.inkSecondary }]}>{t("gate.subscriberGeneration")}</Text>
          </View>
        </View>
        <Text accessibilityRole="header" style={[type.pageTitle, { paddingTop: space[24] }]}>
          {t("gate.title")}
        </Text>
        <Text style={styles.body}>{t("gate.body")}</Text>

        <View style={styles.draft}>
          <View style={styles.thumbFrame}>
            <Image source={photos.table} style={styles.thumb} contentFit="cover" accessibilityLabel={t("tableAlt", { product })} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
              <Text style={[type.cardTitle, { flex: 1 }]} numberOfLines={1}>
                {reel.title}
              </Text>
              <Tag label={t("gate.saved")} tone="white" />
            </View>
            <Text style={[type.body, { color: color.inkSecondary }]} numberOfLines={1}>
              {t("gate.reelFacts", { seconds: formatNumber(reel.seconds), count: reel.scenes })}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
              <Coins size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
              <Text style={[type.meta, { color: color.ink }]}>{t("gate.creditsPerReel", { count: reel.credits, n: formatNumber(reel.credits) })}</Text>
            </View>
          </View>
        </View>

        <View style={{ gap: space[8], paddingTop: space[20] }}>
          <ActionButton label={t("viewPlans")} trailing={ArrowRight} onPress={() => router.push("/plans")} />
          <ActionButton label={t("gate.keepEditing")} variant="ghost" onPress={close} />
        </View>
        <Text style={[type.body, { color: color.inkSecondary, textAlign: "center", paddingTop: space[16] }]}>
          {t("gate.afterActivation")}
        </Text>
      </Sheet>
      {/* Above the scrim, as in the design: the close button stays crisp over the blurred studio. */}
      <CloseButton onPress={close} style={[styles.close, { top: top + space[16] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space[12], paddingHorizontal: space[20], paddingBottom: space[12] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.ink },
  ghost: { flexDirection: "row", gap: space[16], padding: space[24], borderRadius: radius.card, backgroundColor: color.surface, opacity: 0.6 },
  ghostThumb: { width: 60, height: 76, borderRadius: radius.nested },
  ghostLine: { height: 10, borderRadius: 5, backgroundColor: "#E3E1EE" },
  close: { position: "absolute", right: space[20], backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlOutline },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  spark: { width: 40, height: 40, borderRadius: radius.nested, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F2FD", borderWidth: 1, borderColor: "#DCD7F5" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingVertical: 4,
    paddingHorizontal: space[16],
    borderRadius: radius.control,
    backgroundColor: "#F4F2FD",
    borderWidth: 1,
    borderColor: "#DCD7F5",
  },
  body: { ...type.body, color: color.inkSecondary, paddingTop: space[16] },
  draft: {
    marginTop: space[20],
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    padding: space[12],
    borderRadius: radius.control,
    backgroundColor: "#F5F4F8",
    borderWidth: 1,
    borderColor: "#E3E1EE",
  },
  thumbFrame: { padding: 4, borderRadius: radius.nested, backgroundColor: color.surface, borderWidth: 1, borderColor: "#E3E1EE" },
  thumb: { width: 52, height: 52, borderRadius: 8 },
});
