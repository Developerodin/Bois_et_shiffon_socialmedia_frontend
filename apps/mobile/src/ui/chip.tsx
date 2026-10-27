import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";
import { color, radius, space } from "@/theme/tokens";

/** Toggle chip (Figma "Button / Modern · 100" etc.): selected = lilac + 2px indigo + check; else white + outline. */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.on : styles.off]}
    >
      <Text style={[styles.text, selected && { color: "#4C40BB" }]}>{label}</Text>
      {selected && <Check size={14} color="#4C40BB" strokeWidth={2} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: space[8], minHeight: 44, borderRadius: radius.control },
  on: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary, paddingVertical: 9, paddingHorizontal: 11 },
  off: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlOutline, paddingVertical: 10, paddingHorizontal: 12 },
  text: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20, color: color.ink },
});
