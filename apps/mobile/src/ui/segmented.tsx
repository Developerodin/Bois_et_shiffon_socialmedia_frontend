import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space } from "@/theme/tokens";

/** Segmented tabs (Figma "Library · Segmented tabs"): lilac track, selected segment solid indigo. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.track}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={[styles.tab, on && styles.on]}>
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", gap: space[4], padding: space[4], backgroundColor: "#EFECF5", borderWidth: 1, borderColor: "#DED9E6", borderRadius: radius.control },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.nested, borderWidth: 1, borderColor: "transparent" },
  on: { backgroundColor: color.primary, borderColor: color.primary },
  text: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 18, color: color.inkSecondary },
  textOn: { fontFamily: "Inter_600SemiBold", color: color.onPrimary },
});
