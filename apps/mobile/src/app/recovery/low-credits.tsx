import { router } from "expo-router";
import { ArrowRight, Coins } from "lucide-react-native";
import { Trans, useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { ActionButton, ICON, Tag, meta, metaInk, strong14 } from "@/ui/reels/kit";
import { SheetBackdrop, rx } from "@/ui/recovery/parts";
import { failedReel, lowCredits as c } from "@/ui/recovery/sample";
import { Sheet } from "@/ui/recovery/sheet";

/** X02 · Recovery / Low credits — sheet over the storyboard. */
export default function LowCredits() {
  const { t } = useTranslation("recovery");
  const close = () => (router.canGoBack() ? router.back() : router.replace("/reels/storyboard"));
  const share = c.available / c.monthly;
  return (
    <View style={{ flex: 1 }}>
      <SheetBackdrop
        title={t("lowCredits.backdropTitle")}
        card={failedReel.title}
        meta={t("lowCredits.backdropMeta", { seconds: formatNumber(failedReel.seconds) })}
      />
      <Sheet onClose={close} label={t("lowCredits.sheetLabel")}>
        <View style={styles.icon}>
          <Coins size={24} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>{t("lowCredits.title", { count: c.needed, n: formatNumber(c.needed) })}</Text>
        <Text style={styles.body}>
          <Trans t={t}
            ns="recovery"
            i18nKey="lowCredits.body"
            count={c.available}
            values={{ n: formatNumber(c.available) }}
            components={{ b: <Text style={{ fontFamily: font.semibold, color: color.ink }} /> }}
          />
        </Text>

        <View style={styles.plan}>
          <View style={styles.row}>
            <Text style={[strong14, { flex: 1 }]}>{t("lowCredits.planName")}</Text>
            <Tag label={t("lowCredits.active")} tone="grey" />
          </View>
          <View style={[styles.row, { paddingTop: space[12] }]}>
            <Text style={[meta, { flex: 1 }]}>{t("lowCredits.renews")}</Text>
            <Text style={metaInk}>{t("lowCredits.remaining", { available: formatNumber(c.available), monthly: formatNumber(c.monthly) })}</Text>
          </View>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel={t("lowCredits.remainingA11y")}
            accessibilityValue={{ min: 0, max: c.monthly, now: c.available }}
          >
            <View style={[styles.fill, { width: `${share * 100}%` }]} />
          </View>
        </View>

        <View style={{ gap: space[12], paddingTop: space[24] }}>
          <ActionButton label={t("lowCredits.manage")} trailing={ArrowRight} onPress={() => router.push("/plans/billing")} />
          <ActionButton label={t("lowCredits.keepEditing")} variant="outline" onPress={close} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DED9E6" },
  title: { ...type.feature, fontSize: 16, lineHeight: 22, paddingTop: space[24] },
  body: { ...type.body, color: color.inkSecondary, paddingTop: space[8] },
  plan: { marginTop: space[24], padding: space[16], borderRadius: radius.control, backgroundColor: rx.well, borderWidth: 1, borderColor: rx.hairline },
  row: { flexDirection: "row", alignItems: "center" },
  track: { marginTop: space[16], height: 6, borderRadius: 3, backgroundColor: rx.track, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: "#101014" },
});
