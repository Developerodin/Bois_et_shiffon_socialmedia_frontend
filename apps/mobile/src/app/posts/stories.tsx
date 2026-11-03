import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { color, space, type } from "@/theme/tokens";
import { BottomNav, BusinessSwitcher, ModuleHeader, PostsScreen } from "@/ui/posts/chrome";
import { Tag } from "@/ui/reels/kit";

/** P07 · Posts / Stories: not built yet (no story drafts or publishing), so the screen says so instead of showing samples. */
export default function Stories() {
  const { t } = useTranslation("posts");
  return (
    <PostsScreen header={<ModuleHeader />} nav={<BottomNav active="stories" />}>
      <View style={{ height: 56 }}>
        <BusinessSwitcher />
      </View>
      <Text style={type.pageTitle} accessibilityRole="header">
        {t("stories.title")}
      </Text>
      <Text style={type.meta}>{t("stories.subtitle")}</Text>
      <View style={styles.soon}>
        <Tag label={t("stories.comingSoon")} tone="grey" />
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[12] }]}>{t("stories.comingSoonBody")}</Text>
      </View>
    </PostsScreen>
  );
}

const styles = StyleSheet.create({
  soon: { alignItems: "flex-start", paddingTop: space[24] },
});
