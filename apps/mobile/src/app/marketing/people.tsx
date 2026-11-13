import { Fragment } from "react";
import { router, type Href } from "expo-router";
import { Users } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { PageLoading } from "@/ui/page-loading";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "@/i18n";
import { color, space } from "@/theme/tokens";
import { CHANNEL_ICON, replyHref, useInbox } from "@/ui/marketing/inbox";
import { BrandInline, CustomerTabs, Divider, EmptyState, InfoRow, TextButton, TitleHeader, title16 } from "@/ui/marketing/kit";
import { ICON, Panel, ReelsScreen, bodyMuted, meta, metaInk, rc } from "@/ui/reels/kit";

/**
 * M17 · Customers / People: everyone who wrote to the brand on a connected channel, from the inbox's conversations
 * (one row per person per channel, latest contact first). Tapping opens their conversation.
 */
export default function CustomersPeople() {
  const { t } = useTranslation("marketing");
  const { data, error, load } = useInbox();
  const people = data?.conversations ?? [];
  const connected = data?.accounts.filter((a) => a.canRead).length ?? 0;

  return (
    <ReelsScreen bg={color.canvas} glow={false} header={<TitleHeader title={t("shared.customers")} right={<BrandInline />} />} contentStyle={{ paddingTop: space[16] }}>
      <CustomerTabs active="people" />
      {error ? (
        <View style={{ paddingTop: space[16] }}>
          <Text style={[meta, { color: color.error }]}>{error}</Text>
          <TextButton label={t("google.retry")} onPress={load} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : null}
      {!data && !error ? <PageLoading rows={4} /> : null}

      {data && !people.length ? (
        <View style={{ marginTop: space[20] }}>
          <EmptyState
            Icon={Users}
            title={t("people.emptyTitle")}
            body={t("people.emptyBody")}
            action={{ label: t("people.connectChannel"), onPress: () => router.push((connected ? "/marketing/inbox" : "/business/connections") as Href) }}
          />
        </View>
      ) : null}

      {people.length ? (
        <Panel style={{ marginTop: space[20], paddingVertical: space[8] }}>
          {people.map((p, i) => {
            const { Icon } = CHANNEL_ICON[p.channel];
            const name = p.person.name ?? t("inbox.customer");
            return (
              <Fragment key={`${p.connectionId}:${p.id}`}>
                {i > 0 ? <Divider /> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => router.push(replyHref(p))} style={{ flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 52 }}>
                  <Icon size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
                  <Text style={[metaInk, { flex: 1 }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={meta}>{formatDate(p.updatedAt, { day: "numeric", month: "short" })}</Text>
                </Pressable>
              </Fragment>
            );
          })}
        </Panel>
      ) : null}

      <Panel style={{ marginTop: 40 }}>
        <Text style={title16}>{t("people.directoryTitle")}</Text>
        <Text style={[bodyMuted, { paddingTop: space[12] }]}>{t("people.directoryBody")}</Text>
        <Divider style={{ marginTop: space[20], marginBottom: space[16], backgroundColor: "#E4E3E9" }} />
        <InfoRow label={t("people.connectedChannels")} value={formatNumber(connected)} />
      </Panel>
    </ReelsScreen>
  );
}
