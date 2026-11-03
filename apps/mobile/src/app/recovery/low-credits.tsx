import { router, useLocalSearchParams } from "expo-router";
import { Coins } from "lucide-react-native";
import { Trans, useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { ActionButton, ICON, meta, metaInk, strong14 } from "@/ui/reels/kit";
import { SheetBackdrop, rx } from "@/ui/recovery/parts";
import { Sheet } from "@/ui/recovery/sheet";
import { useCredits } from "@/ui/use-credits";

/**
 * X02 · Recovery / Low credits: sheet over the screen whose paid action was refused (402). Shows what it needs against
 * the workspace's real balance. ponytail: no plans or billing backend yet, so the design's monthly-plan bar shows the
 * balance against what's needed instead of a plan allowance. Plans can't be bought yet, so the sheet says how credits
 * are added today instead of sending people to the Plans screens.
 */
export default function LowCredits() {
  const { t } = useTranslation("recovery");
  const p = useLocalSearchParams<{ needed?: string; title?: string; meta?: string; backdrop?: string }>();
  const needed = Math.max(0, Number(p.needed) || 0);
  const available = useCredits();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/reels/storyboard"));
  const share = available === null || needed === 0 ? 0 : Math.min(1, available / needed);
  return (
    <View style={{ flex: 1 }}>
      <SheetBackdrop title={p.backdrop || t("lowCredits.backdropTitle")} card={p.title ?? ""} meta={p.meta ?? ""} />
      <Sheet onClose={close} label={t("lowCredits.sheetLabel")}>
        <View style={styles.icon}>
          <Coins size={24} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          {t("lowCredits.title", { count: needed, n: formatNumber(needed) })}
        </Text>
        {available !== null ? (
          <Text style={styles.body}>
            <Trans
              t={t}
              ns="recovery"
              i18nKey="lowCredits.body"
              count={available}
              values={{ n: formatNumber(available) }}
              components={{ b: <Text style={{ fontFamily: font.semibold, color: color.ink }} /> }}
            />
          </Text>
        ) : null}

        <View style={styles.plan}>
          <View style={styles.row}>
            <Text style={[strong14, { flex: 1 }]}>{t("lowCredits.balance")}</Text>
          </View>
          <View style={[styles.row, { paddingTop: space[12] }]}>
            <Text style={[meta, { flex: 1 }]}>{t("lowCredits.neededLabel")}</Text>
            <Text style={metaInk}>{t("lowCredits.remaining", { available: available === null ? "…" : formatNumber(available), needed: formatNumber(needed) })}</Text>
          </View>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={t("lowCredits.remainingA11y")} accessibilityValue={{ min: 0, max: needed, now: available ?? 0 }}>
            <View style={[styles.fill, { width: `${share * 100}%` }]} />
          </View>
        </View>

        <View style={{ gap: space[12], paddingTop: space[24] }}>
          <Text style={[meta, { textAlign: "center" }]}>{t("lowCredits.howToGet")}</Text>
          <ActionButton label={t("lowCredits.keepEditing")} onPress={close} />
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
