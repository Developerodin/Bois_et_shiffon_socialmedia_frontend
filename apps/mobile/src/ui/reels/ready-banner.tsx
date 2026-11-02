import { router, usePathname } from "expo-router";
import { CircleAlert, CircleCheck } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, radius, space, type } from "@/theme/tokens";
import { pushActive, useNotificationOpens } from "@/ui/push";
import { onRenderFinished, type RenderFinished } from "@/ui/reels/render-watch";
import { ICON } from "@/ui/reels/kit";
import { openReel, reelId } from "@/ui/reels/use-reel";

const SHOW_MS = 10_000;

/**
 * "Your reel is ready" / "couldn't be made", over whatever screen is open, for renders started on this phone.
 * Quiet on R05 for that same reel (it moves on by itself) and when push notifications already said it.
 */
export function ReadyBanner() {
  const { t } = useTranslation("reels");
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const [shown, setShown] = useState<RenderFinished | null>(null);
  useEffect(() => onRenderFinished((f) => setShown(f)), []);
  // A tapped push notification opens its reel the same way (mounted with navigation, so it can go there).
  useNotificationOpens(useCallback((id: string, ok: boolean) => (openReel(id), router.push(ok ? "/reels/review" : "/reels/generating")), []));
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  if (!shown || pushActive() || (path === "/reels/generating" && reelId() === shown.id)) return null;
  const go = () => {
    openReel(shown.id);
    setShown(null);
    router.push(shown.ok ? "/reels/review" : "/reels/generating");
  };
  const Icon = shown.ok ? CircleCheck : CircleAlert;
  return (
    <View style={[styles.wrap, { top: insets.top + space[8] }]} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLiveRegion="polite" onPress={go} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
        <Icon size={22} color={shown.ok ? color.primary : color.error} strokeWidth={ICON.strokeWidth} />
        <View style={{ flex: 1 }}>
          <Text style={[type.label, { color: color.onPrimary }]}>{shown.ok ? t("ready.title") : t("ready.failedTitle")}</Text>
          <Text style={[type.meta, { color: "rgba(255,255,255,0.75)" }]} numberOfLines={1}>{shown.title}</Text>
        </View>
        <Text style={[type.label, { color: color.onPrimary }]}>{shown.ok ? t("ready.watch") : t("ready.seeWhy")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: space[16], right: space[16] },
  card: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 56, paddingHorizontal: space[16], paddingVertical: space[12], borderRadius: radius.card, backgroundColor: color.ink, boxShadow: "0 6px 24px rgba(0,0,0,0.18)" },
});
