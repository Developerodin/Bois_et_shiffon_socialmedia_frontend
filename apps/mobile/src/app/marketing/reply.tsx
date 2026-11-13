import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Bot, ShieldCheck } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { PageLoading } from "@/ui/page-loading";
import { useTranslation } from "react-i18next";
import { aiDraft, inbox, type Thread } from "@/api/endpoints";
import { formatDate } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BrandInline, TextButton, TitleHeader, mc, title16 } from "@/ui/marketing/kit";
import { ActionButton, ICON, Panel, ReelsScreen, bodyMuted, meta, metaInk, rc } from "@/ui/reels/kit";

/**
 * M03 · Customers / Reply assistant, on one real conversation (?c=connectionId&id=conversationId). "Draft reply" asks
 * the AI for a suggestion from the latest messages; the person edits it, and only their "Send" tap sends it.
 */
export default function ReplyAssistant() {
  const { t } = useTranslation("marketing");
  const { c, id } = useLocalSearchParams<{ c?: string; id?: string }>();
  const [data, setData] = useState<Thread | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    if (!c || !id) return void router.replace("/marketing/inbox");
    setError(null);
    inbox.thread(c, id).then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [c, id]);
  useFocusEffect(load);

  const run = async (kind: "draft" | "send", call: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setSent(false);
    try {
      await call();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const suggest = () =>
    run("draft", async () => {
      const text = data!.messages.slice(-10).map((m) => `${m.fromCustomer ? "Customer" : "Us"}: ${m.text}`).join("\n");
      setDraft(await aiDraft({ kind: "message", text }));
    });
  const send = () =>
    run("send", async () => {
      await inbox.send(c!, id!, draft!.trim());
      setDraft(null);
      setSent(true);
      load();
    });

  const name = data?.person.name ?? t("inbox.customer");
  return (
    <ReelsScreen bg={color.canvas} glow={false} header={<TitleHeader title={t("reply.title")} fallback="/marketing/inbox" right={<BrandInline />} />} contentStyle={{ paddingTop: space[16] }}>
      {!data && !error ? <PageLoading /> : null}

      {data ? (
        <Panel>
          <Text style={title16}>{name}</Text>
          <Text style={meta}>{t(`reply.via.${data.channel}`, { account: data.account })}</Text>
          <View style={{ gap: space[8], paddingTop: space[16] }}>
            {data.messages.map((m) => (
              <View key={m.id} style={[styles.bubble, m.fromCustomer ? styles.them : styles.us]}>
                <Text style={metaInk}>{m.text || t("reply.attachment")}</Text>
                <Text style={[meta, { fontSize: 11, paddingTop: 2 }]}>{formatDate(m.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            ))}
          </View>

          <View style={styles.suggestion}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
              <Bot size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
              <Text style={styles.suggestionTitle}>{t("reply.suggestionTitle")}</Text>
            </View>
            {draft === null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[8] }}>
                <TextButton label={t("reviews.draftReply")} disabled={busy !== null} onPress={() => void suggest()} />
                <TextButton label={t("reply.writeOwn")} disabled={busy !== null} onPress={() => setDraft("")} />
                {busy === "draft" ? <ActivityIndicator color={color.primary} /> : null}
              </View>
            ) : (
              <>
                <TextInput value={draft} onChangeText={setDraft} multiline autoFocus maxLength={1000} accessibilityLabel={t("reply.draftLabel")} style={styles.draftBox} />
                <View style={[styles.rowBetween, { paddingTop: space[12] }]}>
                  <TextButton label={t("reviews.cancel")} onPress={() => setDraft(null)} />
                  <ActionButton label={t("reply.send")} disabled={busy !== null || !draft.trim()} onPress={() => void send()} />
                </View>
              </>
            )}
            {sent ? <Text style={[metaInk, { paddingTop: space[8] }]}>{t("reply.sent")}</Text> : null}
          </View>
        </Panel>
      ) : null}

      {error ? (
        <View style={{ paddingTop: space[16] }}>
          <Text style={[meta, { color: color.error }]}>{error}</Text>
          {!data ? <TextButton label={t("google.retry")} onPress={load} style={{ alignSelf: "flex-start" }} /> : null}
        </View>
      ) : null}

      <Panel style={[styles.notice, { marginTop: space[24] }]}>
        <ShieldCheck size={20} color={color.ink} strokeWidth={ICON.strokeWidth} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={[title16, { fontSize: 15 }]}>{t("reply.approvalTitle")}</Text>
          <Text style={[bodyMuted, { paddingTop: 2 }]}>{t("reply.approvalBody")}</Text>
        </View>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "85%", paddingVertical: space[8], paddingHorizontal: space[12], borderRadius: radius.card, borderWidth: 1, borderColor: rc.border },
  them: { alignSelf: "flex-start", backgroundColor: color.surface },
  us: { alignSelf: "flex-end", backgroundColor: mc.tile, borderColor: mc.tileBorder },
  suggestion: { marginTop: space[16], padding: space[16], borderRadius: radius.card, borderWidth: 1, borderColor: rc.border },
  suggestionTitle: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.inkSecondary },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  draftBox: { ...type.body, fontSize: 14, minHeight: 100, textAlignVertical: "top", marginTop: space[12], padding: space[12], borderRadius: radius.control, borderWidth: 1, borderColor: color.primary },
  notice: { flexDirection: "row", gap: space[12] },
});
