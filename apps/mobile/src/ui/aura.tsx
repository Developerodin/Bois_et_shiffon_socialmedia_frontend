import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

/**
 * The soft peach/lavender blobs behind the logo (Figma 408:5–9). Figma blurs flat circles;
 * radial gradients that fade to transparent give the same look without a blur pass.
 */
const BLOBS = [
  { cx: 310, cy: 64, r: 112, stops: ["rgba(255,203,190,0.85)", "rgba(246,178,192,0.5)"] },
  { cx: 80, cy: 168, r: 128, stops: ["rgba(206,212,255,0.9)", "rgba(220,195,252,0.6)"] },
  { cx: 350, cy: 240, r: 64, stops: ["rgba(255,226,218,0.75)", "rgba(232,226,255,0.45)"] },
  { cx: 195, cy: 176, r: 96, stops: ["rgba(255,255,255,0.8)", "rgba(240,237,253,0.4)"] },
] as const;

/** Soft lavender→peach radial wash at the top of a screen (Figma A02/A03 container backgrounds). */
export function Glow({ height = 420 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]}>
      <Svg width="100%" height={height} viewBox={`0 0 390 ${height}`} preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="15%" r="70%">
            <Stop offset="0" stopColor="#E1D7F8" stopOpacity={0.45} />
            <Stop offset="0.45" stopColor="#FEEBE6" stopOpacity={0.35} />
            <Stop offset="0.7" stopColor="#FEEBE6" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={195} cy={60} r={420} fill="url(#glow)" />
      </Svg>
    </View>
  );
}

export function Aura({ height = 320, opacity = 1 }: { height?: number; opacity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height, opacity }]}>
      <Svg width="100%" height={height} viewBox={`0 0 390 ${height}`} preserveAspectRatio="xMidYMin slice">
        <Defs>
          {BLOBS.map((b, i) => (
            <RadialGradient key={i} id={`aura${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={b.stops[0]} />
              <Stop offset="0.5" stopColor={b.stops[1]} />
              <Stop offset="1" stopColor={b.stops[1]} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {BLOBS.map((b, i) => (
          <Circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={`url(#aura${i})`} />
        ))}
      </Svg>
    </View>
  );
}
