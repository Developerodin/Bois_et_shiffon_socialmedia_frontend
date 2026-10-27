import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, space } from "@/theme/tokens";

/**
 * Bottom sheet on React Native's built-in Modal (Figma X02 / X03 / L02).
 * The scrim is drawn outside the Modal so it stays put while the sheet slides up;
 * render <Sheet> as the last child of a full-screen container. Tapping above the sheet,
 * or the Android back gesture, calls onClose.
 */
export function Sheet({
  onClose,
  children,
  visible = true,
  scrim = "rgba(10,10,12,0.82)", // Figma X02/X03: near-black over the blurred screen
  bg = color.surface,
  label,
  gutter = space[24],
}: {
  onClose: () => void;
  children: ReactNode;
  visible?: boolean;
  scrim?: string;
  bg?: string;
  label?: string;
  gutter?: number;
}) {
  const { t } = useTranslation("recovery");
  const { bottom } = useSafeAreaInsets();
  return (
    <>
      {visible ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} /> : null}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <View style={styles.root}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("sheet.dismiss")} onPress={onClose} style={{ flex: 1, outlineColor: "transparent" }} />
          <View style={[styles.sheet, { backgroundColor: bg }]} accessibilityViewIsModal accessibilityLabel={label}>
            <View style={styles.handle} />
            <ScrollView bounces={false} contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: Math.max(bottom, space[24]) }}>
              {children}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: space[20],
    boxShadow: "0 -8px 32px rgba(16,16,20,0.08)",
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#E4E4E7", marginBottom: space[20] },
});
