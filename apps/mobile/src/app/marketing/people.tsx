import { router } from "expo-router";
import { Users } from "lucide-react-native";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n";
import { color, space } from "@/theme/tokens";
import { BrandInline, CustomerTabs, Divider, EmptyState, InfoRow, TitleHeader, title16 } from "@/ui/marketing/kit";
import { channels } from "@/ui/marketing/sample";
import { Panel, ReelsScreen, bodyMuted } from "@/ui/reels/kit";

/** M17 · Customers / People (empty). Channels are connected from the Inbox tab. */
export default function CustomersPeople() {
  const { t } = useTranslation("marketing");
  const connected = channels.filter((c) => c.status !== "notConnected").length;
  return (
    <ReelsScreen
      bg={color.canvas}
      glow={false}
      header={<TitleHeader title={t("shared.customers")} right={<BrandInline />} />}
      contentStyle={{ paddingTop: space[16] }}
    >
      <CustomerTabs active="people" />

      <View style={{ marginTop: space[20] }}>
        <EmptyState
          Icon={Users}
          title={t("people.emptyTitle")}
          body={t("people.emptyBody")}
          action={{ label: t("people.connectChannel"), onPress: () => router.replace("/marketing/inbox") }}
        />
      </View>

      <Panel style={{ marginTop: 40 }}>
        <Text style={title16}>{t("people.directoryTitle")}</Text>
        <Text style={[bodyMuted, { paddingTop: space[12] }]}>{t("people.directoryBody")}</Text>
        <Divider style={{ marginTop: space[20], marginBottom: space[16], backgroundColor: "#E4E3E9" }} />
        <InfoRow label={t("people.connectedChannels")} value={formatNumber(connected)} />
      </Panel>
    </ReelsScreen>
  );
}
