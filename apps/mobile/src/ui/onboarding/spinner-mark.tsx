import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { color } from "@/theme/tokens";

/** Espanda mark in a white disc with a slowly turning dashed ring (A08 / A11). */
export function SpinnerMark({ size = 112 }: { size?: number }) {
  const { t } = useTranslation("onboarding");
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const r = size / 2 - 3;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityLabel={t("learning.working")} accessibilityRole="progressbar">
      <View style={[styles.halo, { width: size + 16, height: size + 16, borderRadius: size }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="#E8E7ED" strokeWidth={3} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.ink} strokeWidth={3} fill="none" strokeDasharray="22 26" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <View style={styles.disc}>
        <Image source={require("../../../assets/figma/onboarding/espanda-mark.jpg")} style={{ width: 48, height: 48 }} contentFit="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: "absolute", backgroundColor: "#EDE9FE", opacity: 0.6 },
  disc: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#E8E7ED",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
});
