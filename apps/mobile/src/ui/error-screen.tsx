import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, layout, space, type } from "@/theme/tokens";

/** Full-screen message for the not-found and crash screens: a title, a line of help, and its buttons. */
export function ErrorScreen({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <View style={styles.box}>
        <Text accessibilityRole="header" style={type.pageTitle}>
          {title}
        </Text>
        <Text style={[type.body, { color: color.inkSecondary }]}>{body}</Text>
        <View style={{ gap: space[12], marginTop: space[8] }}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.canvas, justifyContent: "center" },
  box: { paddingHorizontal: layout.gutter, gap: space[12] },
});
