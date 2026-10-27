import { Image, type ImageSource } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { color, layout, radius, space, type } from "@/theme/tokens";
import { icons } from "@/ui/icons";

/**
 * Espanda button (Figma "Library · Button"). Variants seen across the app:
 * primary (indigo), disabled (grey), outline (white + control outline), ghost (text only).
 */
type Variant = "primary" | "outline" | "ghost";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Trailing arrow, as on Continue / Get started / Send code. */
  arrow?: boolean;
  /** Leading icon (Google, Apple, Instagram…). */
  icon?: ImageSource;
  /** Primary buttons are 48 tall; outline/ghost default to 44–46. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({ label, onPress, variant = "primary", disabled, loading, arrow, icon, height, style, accessibilityLabel }: Props) {
  const off = disabled || loading;
  const v = off && variant === "primary" ? styles.disabled : styles[variant];
  const ink = off && variant === "primary" ? color.disabledInk : variant === "primary" ? color.onPrimary : color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { minHeight: height ?? (variant === "primary" ? layout.buttonHeight : 46) },
        v,
        pressed && !off && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={ink} /> : icon ? <Image source={icon} style={styles.icon} contentFit="contain" /> : null}
      <Text style={[type.label, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
      {arrow && !loading ? (
        <Image source={variant === "primary" && !off ? icons.arrowRightWhite : icons.arrowRight} style={styles.icon} contentFit="contain" />
      ) : null}
    </Pressable>
  );
}

/** 44×44 square icon button (Back, Close, More options). */
export function IconButton({ icon, onPress, label }: { icon: ImageSource; onPress?: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}>
      <View>
        <Image source={icon} style={styles.icon} contentFit="contain" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[8],
    paddingHorizontal: space[12],
    minWidth: layout.minTarget,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "transparent",
  },
  primary: { backgroundColor: color.primary },
  disabled: { backgroundColor: color.disabledBg },
  outline: { backgroundColor: color.surface, borderColor: color.controlOutline },
  ghost: { backgroundColor: "transparent" },
  icon: { width: 20, height: 20 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
});
