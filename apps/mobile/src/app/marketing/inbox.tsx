import { router, type Href } from "expo-router";
import { ArrowRight, Lock, MessageCircle } from "lucide-react-native";
import { Fragment } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PageLoading } from "@/ui/page-loading";
import { useTranslation } from "react-i18next";
import type { Conversation } from "@/api/endpoints";
import { formatDate } from "@/i18n";
import { color, space } from "@/theme/tokens";
import { BrandInline, CustomerTabs, Divider, EmptyState, TextButton, TitleHeader } from "@/ui/marketing/kit";
import { CHANNEL_ICON, replyHref, useInbox } from "@/ui/marketing/inbox";
import { ICON, Panel, ReelsScreen, eyebrow, meta, metaInk, rc } from "@/ui/reels/kit";

/**
 * M02 · Customers / Inbox: Instagram Direct and Messenger conversations from the brand's connected accounts, newest
 * first. Accounts connected before the inbox existed say "Reconnect" (they lack message access). WhatsApp: coming soon.
 */
export default function CustomersInbox() {
  const { t } = useTranslation("marketing");
  const { data, error, load } = useInbox();
  const readable = data?.accounts.some((a) => a.canRead && !a.error) ?? false;

  return (
    <ReelsScreen bg={color.canvas} glow={false} header={<TitleHeader title={t("shared.customers")} right={<BrandInline />} />} contentStyle={{ paddingTop: space[16] }}>
      <CustomerTabs active="inbox" />
      {error ? (
        <View style={{ paddingTop: space[16] }}>
          <Text style={[meta, { color: color.error }]}>{error}</Text>
          <TextButton label={t("google.retry")} onPress={load} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : null}
      {!data && !error ? <PageLoading rows={4} /> : null}

      {data && !readable ? (
        <View style={{ marginTop: space[20] }}>
          <EmptyState
            Icon={MessageCircle}
            iconColor={rc.navInk}
            title={t("inbox.emptyTitle")}
            body={t("inbox.emptyBody")}
            action={{ label: t("inbox.connectChannel"), trailing: ArrowRight, onPress: () => router.push("/business/connections" as Href) }}
            footnote={t("inbox.emptyFootnote")}
          />
        </View>
      ) : null}

      {data && readable ? (
        data.conversations.length ? (
          <Panel style={{ marginTop: space[20], paddingVertical: space[8] }}>
            {data.conversations.map((c, i) => (
              <Fragment key={c.id}>
                {i > 0 ? <Divider /> : null}
                <ConversationRow c={c} />
              </Fragment>
            ))}
          </Panel>
        ) : (
          <Panel style={{ marginTop: space[20] }}>
            <Text style={metaInk}>{t("inbox.noConversations")}</Text>
          </Panel>
        )
      ) : null}

      {data ? (
        <Panel style={{ marginTop: space[20], paddingBottom: space[12] }}>
          <Text style={eyebrow}>{t("inbox.channelsTitle")}</Text>
          <View style={{ paddingTop: space[8] }}>
            {(["INSTAGRAM", "META", "WHATSAPP"] as const).map((id, i) => {
              const { Icon, bg, name } = CHANNEL_ICON[id];
              const accounts = data.accounts.filter((a) => a.channel === id);
              const status =
                id === "WHATSAPP"
                  ? t("tools.comingSoon")
                  : !accounts.length
                    ? t("shared.status.notConnected")
                    : accounts.some((a) => !a.canRead)
                      ? t("inbox.reconnect")
                      : (accounts.find((a) => a.error)?.error ?? accounts.map((a) => a.name).join(", "));
              return (
                <Fragment key={id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.channel} accessible accessibilityLabel={t("inbox.channelLabel", { name, status })}>
                    <View style={[styles.channelIcon, { backgroundColor: bg }]}>
                      <Icon size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
                    </View>
                    <Text style={[metaInk, { fontSize: 13, flex: 1 }]}>{name}</Text>
                    <Text style={[meta, { flexShrink: 1, textAlign: "right" }]} numberOfLines={2}>
                      {status}
                    </Text>
                  </View>
                </Fragment>
              );
            })}
          </View>
          {data.accounts.some((a) => !a.canRead) ? <TextButton label={t("inbox.openConnections")} trailing={ArrowRight} onPress={() => router.push("/business/connections" as Href)} style={{ alignSelf: "flex-start" }} /> : null}
        </Panel>
      ) : null}

      <View style={styles.lockNote}>
        <Lock size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
        <Text style={[meta, { fontSize: 13 }]}>{t("reply.approvalBody")}</Text>
      </View>
    </ReelsScreen>
  );
}

function ConversationRow({ c }: { c: Conversation }) {
  const { t } = useTranslation("marketing");
  const { Icon, bg } = CHANNEL_ICON[c.channel];
  const name = c.person.name ?? t("inbox.customer");
  const text = c.last ? (c.last.fromCustomer ? c.last.text : t("inbox.you", { text: c.last.text })) : "";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}. ${text}`} onPress={() => router.push(replyHref(c))} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={[styles.channelIcon, { backgroundColor: bg, width: 36, height: 36, borderRadius: 18 }]}>
        <Icon size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space[8] }}>
          <Text style={[metaInk, { flexShrink: 1 }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={meta}>{formatDate(c.updatedAt, { day: "numeric", month: "short" })}</Text>
        </View>
        <Text style={meta} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  channel: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 53 },
  channelIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 60, paddingVertical: space[8] },
  lockNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[12], marginTop: space[32], paddingHorizontal: space[16] },
});
