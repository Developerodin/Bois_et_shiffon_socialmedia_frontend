import type { ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { Label } from "@/ui/layout";

/** White field with control outline, optional leading/trailing slots (Figma 408:30, 408:365). */
export function Field({
  label,
  leading,
  trailing,
  error,
  height = 56,
  multiline,
  ...input
}: TextInputProps & { label?: string; leading?: ReactNode; trailing?: ReactNode; error?: string | null; height?: number }) {
  return (
    <View>
      {label ? <Label>{label}</Label> : null}
      <View style={[styles.box, { minHeight: multiline ? 96 : height }, multiline && styles.multi, !!error && { borderColor: color.error }]}>
        {leading}
        <TextInput
          placeholderTextColor={color.inkMuted}
          style={[styles.input, multiline && { textAlignVertical: "top", minHeight: 72 }]}
          multiline={multiline}
          accessibilityLabel={label}
          {...input}
        />
        {trailing}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[type.meta, { color: color.error, paddingTop: space[8] }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingHorizontal: space[16],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  multi: { alignItems: "flex-start", paddingVertical: space[12] },
  input: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 16, lineHeight: 24, color: color.ink, paddingVertical: 10 },
});
