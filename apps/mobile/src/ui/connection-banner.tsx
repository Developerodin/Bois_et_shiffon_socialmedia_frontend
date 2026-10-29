import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { connection } from "@/api/client";
import { color, radius, space, type } from "@/theme/tokens";

/**
 * Says when Espanda can't be reached, and when it's back (src/api/client.ts tracks it). Screens that were loading
 * retry by themselves once it's back; anything being saved shows its own error to try again.
 */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<"online" | "offline" | "back">(connection.current());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = connection.subscribe((c) => {
      clearTimeout(timer);
      if (c === "offline") return setState("offline");
      setState("back");
      timer = setTimeout(() => setState("online"), 3000);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, []);
  if (state === "online") return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + space[16] }]}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.pill, state === "back" && styles.back]}>
        {t(state === "offline" ? "net.offline" : "net.backOnline")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: space[16], right: space[16], alignItems: "center" },
  pill: { ...type.label, color: color.onPrimary, backgroundColor: color.ink, borderRadius: radius.control, paddingHorizontal: space[16], paddingVertical: space[12], textAlign: "center", overflow: "hidden" },
  back: { backgroundColor: color.primary },
});
