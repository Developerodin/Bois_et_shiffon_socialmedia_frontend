import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { color, radius, space } from "@/theme/tokens";

/**
 * The first load of a page: placeholder cards shaped like the app's cards, gently pulsing,
 * in place of a lone spinner at the top. Pass `rows` for how many cards the page usually shows
 * and `photo` when its cards lead with an image. Holds still when the system asks to reduce motion.
 */
export function PageLoading({ rows = 2, photo = false, style }: { rows?: number; photo?: boolean; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [pulse]);

  return (
    <View style={[{ marginTop: space[16], gap: space[12] }, style]} accessible accessibilityRole="progressbar" accessibilityLabel={t("loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={[styles.card, { opacity: pulse }]}>
          {photo ? <View style={styles.photo} /> : null}
          <View style={[styles.line, { width: "62%" }]} />
          <View style={[styles.line, styles.short]} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space[16], gap: space[8], backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20, borderWidth: 1, borderColor: color.divider },
  photo: { height: 140, borderRadius: radius.control, backgroundColor: color.disabledBg, marginBottom: space[4] },
  line: { height: 14, borderRadius: radius.badge, backgroundColor: color.disabledBg },
  short: { width: "38%", height: 12 },
});
