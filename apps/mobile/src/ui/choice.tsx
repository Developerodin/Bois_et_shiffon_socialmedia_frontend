import type { ReactNode } from "react";
import { Image, type ImageProps, type ImageSource } from "expo-image";
import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";

/**
 * Selectable surfaces (Figma "Radio Button" frames). Unselected: white + 1px #E4E3E9.
 * Selected: #EEEAFC + 2px indigo, padding shrinks by 1 so the content doesn't shift.
 */

/** Full-width radio row with an icon tile, title, description and a radio dot (A05). */
export function OptionRow({ icon, title, description, selected, onPress }: { icon: ReactNode; title: string; description: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={[styles.row, selected ? styles.on : styles.off, { padding: selected ? 11 : 12, paddingHorizontal: selected ? 15 : 16 }]}
    >
      <View style={[styles.tile, { backgroundColor: selected ? color.primary : "#F4F4F5" }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={type.meta}>{description}</Text>
      </View>
      {selected ? (
        <View style={styles.dotOn}>
          <Check size={14} color={color.onPrimary} strokeWidth={2.5} />
        </View>
      ) : (
        <View style={styles.dotOff} />
      )}
    </Pressable>
  );
}

/** Picture tile with title + caption and a corner check when selected (A04). */
export function ChoiceCard({ image, title, description, selected, onPress }: { image: ImageProps["source"]; title: string; description: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={[styles.card, selected ? styles.on : styles.offCard, { padding: selected ? 15 : 16 }]}
    >
      <View style={styles.thumb}>
        <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={[type.meta, { paddingTop: space[4] }]}>{description}</Text>
      </View>
      {selected && (
        <View style={styles.corner}>
          <Check size={14} color={color.onPrimary} strokeWidth={2.5} />
        </View>
      )}
    </Pressable>
  );
}

export function iconTile(source: ImageSource) {
  return <Image source={source} style={{ width: 20, height: 20 }} contentFit="contain" />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[12], borderRadius: radius.card, minHeight: 66 },
  card: { flex: 1, gap: space[12], borderRadius: radius.card, minHeight: 216 },
  on: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary },
  off: { backgroundColor: color.surface, borderWidth: 1, borderColor: "#E4E3E9" },
  offCard: { backgroundColor: color.surface, borderWidth: 1, borderColor: "#D6D0DF" },
  tile: { width: 40, height: 40, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  title: { ...type.label, fontFamily: "Inter_600SemiBold" },
  dotOn: { width: 20, height: 20, borderRadius: 10, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  dotOff: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.2)" },
  thumb: { height: 88, borderRadius: radius.nested, overflow: "hidden", backgroundColor: "#EFEBF6" },
  corner: { position: "absolute", top: 24, right: 24, width: 22, height: 22, borderRadius: 11, backgroundColor: color.primary, borderWidth: 1, borderColor: color.surface, alignItems: "center", justifyContent: "center" },
});
