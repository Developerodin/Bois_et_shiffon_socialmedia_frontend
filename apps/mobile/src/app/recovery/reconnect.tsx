import { Image } from "expo-image";
import { router } from "expo-router";
import { Lock, RefreshCw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { formatDate } from "@/i18n";
import { color, radius, space, type } from "@/theme/tokens";
import { ActionButton, ICON, meta, strong14 } from "@/ui/reels/kit";
import { SheetBackdrop, rx } from "@/ui/recovery/parts";
import { photos, reconnect as r } from "@/ui/recovery/sample";
import { Sheet } from "@/ui/recovery/sheet";

/** X03 · Recovery / Reconnect account — sheet over the schedule. */
export default function Reconnect() {
  const { t } = useTranslation("recovery");
  const close = () => (router.canGoBack() ? router.back() : router.replace("/posts"));
  const title = t("reconnect.title", { network: r.network });
  return (
    <View style={{ flex: 1 }}>
      <SheetBackdrop
        title={t("reconnect.backdropTitle")}
        card={r.product}
        meta={t("reconnect.backdropMeta", { date: formatDate(r.scheduledFor, { month: "short", day: "numeric" }) })}
      />
      <Sheet onClose={close} label={title}>
        <View style={styles.icon}>
          <InstagramGlyph />
        </View>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.body}>{t("reconnect.body")}</Text>

        <View style={styles.draft}>
          <Image source={photos.tvUnit} style={styles.thumb} contentFit="cover" accessibilityLabel={r.product} />
          <View style={{ flex: 1 }}>
            <Text style={strong14} numberOfLines={1}>
              {r.draft}
            </Text>
            <Text style={meta}>{t("reconnect.draftSaved")}</Text>
          </View>
        </View>

        <View style={styles.note}>
          <Lock size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
          <Text style={[type.meta, { flex: 1 }]}>{t("reconnect.noPosting")}</Text>
        </View>

        <View style={{ gap: space[12], paddingTop: space[24] }}>
          <ActionButton label={title} leading={RefreshCw} onPress={() => router.push("/business/connections")} />
          <ActionButton label={t("reconnect.saveForLater")} variant="outline" onPress={close} />
        </View>
      </Sheet>
    </View>
  );
}

/** Lucide dropped brand marks, so the Instagram outline is drawn here at Lucide's 24-grid and stroke. */
function InstagramGlyph({ size = 24, ink = color.inkSecondary }: { size?: number; ink?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={ICON.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={2} y={2} width={20} height={20} rx={5} />
      <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <Circle cx={17.5} cy={6.5} r={0.5} fill={ink} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DED9E6" },
  title: { ...type.feature, fontSize: 16, lineHeight: 22, paddingTop: space[24] },
  body: { ...type.body, color: color.inkSecondary, paddingTop: space[8] },
  draft: {
    marginTop: space[20],
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    padding: space[12],
    borderRadius: radius.control,
    backgroundColor: rx.well,
    borderWidth: 1,
    borderColor: rx.hairline,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.nested },
  note: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[20] },
});
