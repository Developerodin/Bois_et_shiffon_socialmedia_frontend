import { router } from "expo-router";
import { Link, Star } from "lucide-react-native";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { color, space } from "@/theme/tokens";
import { BrandInline, CustomerTabs, EmptyState, TitleHeader, mc, title16 } from "@/ui/marketing/kit";
import { Panel, ReelsScreen, Tag, bodyMuted } from "@/ui/reels/kit";

/** M16 · Customers / Reviews (empty). "Connect Google Business" continues to Google Growth setup. */
export default function CustomersReviews() {
  const { t } = useTranslation("marketing");
  return (
    <ReelsScreen
      bg={color.canvas}
      glow={false}
      header={<TitleHeader title={t("shared.customers")} right={<BrandInline />} />}
      contentStyle={{ paddingTop: space[16] }}
    >
      <CustomerTabs active="reviews" />

      <View style={{ marginTop: space[20] }}>
        <EmptyState
          Icon={Star}
          title={t("reviews.emptyTitle")}
          body={t("reviews.emptyBody")}
          action={{ label: t("reviews.connectGoogle"), leading: Link, onPress: () => router.push("/marketing/google") }}
        />
      </View>

      <Panel style={{ marginTop: 40 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] }}>
          <Text style={[title16, { fontSize: 15, flexShrink: 1 }]}>{t("reviews.automatedTitle")}</Text>
          <Tag label={t("reviews.connectFirst")} style={{ backgroundColor: mc.iconCircle, paddingVertical: 4 }} />
        </View>
        <Text style={[bodyMuted, { paddingTop: space[12] }]}>{t("reviews.automatedBody")}</Text>
      </Panel>
    </ReelsScreen>
  );
}
