import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Bot, Link, Share2, Star } from "lucide-react-native";
import { ActivityIndicator, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { aiDraft, google, type GoogleReview } from "@/api/endpoints";
import { formatDate } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BrandInline, CustomerTabs, EmptyState, TextButton, TitleHeader, mc, title16 } from "@/ui/marketing/kit";
import { ActionButton, ICON, Panel, ReelsScreen, Tag, bodyMuted, meta, metaInk, rc } from "@/ui/reels/kit";

/**
 * M16 · Customers / Reviews: the Business Profile's Google reviews. "Draft reply" asks the AI for a suggestion the person
 * edits; "Post reply" (their tap) publishes it on Google. Not connected: the designed empty state, to Google setup.
 */
export default function CustomersReviews() {
  const { t } = useTranslation("marketing");
  const [data, setData] = useState<Awaited<ReturnType<typeof google.reviews>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    google.reviews().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(load);
  const reviewUrl = data?.reviewUrl ?? null;

  return (
    <ReelsScreen bg={color.canvas} glow={false} header={<TitleHeader title={t("shared.customers")} right={<BrandInline />} />} contentStyle={{ paddingTop: space[16] }}>
      <CustomerTabs active="reviews" />
      {error ? (
        <View style={{ paddingTop: space[16] }}>
          <Text style={[meta, { color: color.error }]}>{error}</Text>
          <TextButton label={t("google.retry")} onPress={load} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : null}
      {!data && !error ? <ActivityIndicator color={color.primary} style={{ marginTop: space[24] }} /> : null}

      {data && !data.connected ? (
        <View style={{ marginTop: space[20] }}>
          <EmptyState Icon={Star} title={t("reviews.emptyTitle")} body={t("reviews.emptyBody")} action={{ label: t("reviews.connectGoogle"), leading: Link, onPress: () => router.push("/marketing/google") }} />
        </View>
      ) : null}

      {data?.connected ? (
        <>
          <Panel style={[styles.rowBetween, { marginTop: space[20] }]}>
            <View>
              <Text style={type.feature}>{data.average ? data.average.toFixed(1) : "–"} ★</Text>
              <Text style={meta}>{t("reviews.count", { count: data.total ?? 0 })}</Text>
            </View>
          </Panel>
          {data.reviews.length ? (
            <View style={{ gap: space[12], marginTop: space[12] }}>
              {data.reviews.map((r) => (
                <ReviewCard key={r.id} review={r} onReplied={(reply) => setData({ ...data, reviews: data.reviews.map((x) => (x.id === r.id ? { ...x, reply } : x)) })} />
              ))}
            </View>
          ) : (
            <Panel style={{ marginTop: space[12] }}>
              <Text style={title16}>{t("reviews.emptyTitle")}</Text>
              <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("reviews.connectedEmptyBody")}</Text>
            </Panel>
          )}
        </>
      ) : null}

      {data ? (
        <Panel style={{ marginTop: 40 }}>
          <View style={styles.rowBetween}>
            <Text style={[title16, { fontSize: 15, flexShrink: 1 }]}>{t("reviews.automatedTitle")}</Text>
            {reviewUrl ? null : <Tag label={t(data.connected ? "reviews.waitingGoogle" : "reviews.connectFirst")} style={{ backgroundColor: mc.iconCircle, paddingVertical: 4 }} />}
          </View>
          <Text style={[bodyMuted, { paddingTop: space[12] }]}>{t(reviewUrl ? "reviews.linkBody" : "reviews.automatedBody")}</Text>
          {reviewUrl ? <TextButton label={t("reviews.shareLink")} trailing={Share2} onPress={() => void Share.share({ message: reviewUrl })} style={{ alignSelf: "flex-start" }} /> : null}
        </Panel>
      ) : null}
    </ReelsScreen>
  );
}

function ReviewCard({ review, onReplied }: { review: GoogleReview; onReplied: (reply: NonNullable<GoogleReview["reply"]>) => void }) {
  const { t } = useTranslation("marketing");
  const [text, setText] = useState<string | null>(null); // null: not editing
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const run = async (kind: "draft" | "post", call: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setPosted(false);
    try {
      await call();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const draft = () => run("draft", async () => setText(await aiDraft({ kind: "review", text: review.comment, rating: review.rating ?? undefined, author: review.author ?? undefined })));
  const post = () =>
    run("post", async () => {
      onReplied((await google.reply(review.id, text!.trim())).reply);
      setText(null);
      setPosted(true);
    });

  return (
    <Panel>
      <View style={styles.rowBetween}>
        <Text style={[title16, { fontSize: 15, flexShrink: 1 }]} numberOfLines={1}>
          {review.author ?? t("reviews.anonymous")}
        </Text>
        {review.rating ? (
          <Text style={metaInk} accessibilityLabel={t("reviews.stars", { count: review.rating })}>
            {"★".repeat(review.rating)}
          </Text>
        ) : null}
      </View>
      <Text style={meta}>{formatDate(review.createdAt, { day: "numeric", month: "short", year: "numeric" })}</Text>
      {review.comment ? <Text style={[bodyMuted, { paddingTop: space[8] }]}>{review.comment}</Text> : null}

      {review.reply && text === null ? (
        <View style={styles.reply}>
          <Text style={[meta, { fontFamily: font.semibold }]}>{t("reviews.yourReply")}</Text>
          <Text style={[bodyMuted, { paddingTop: 2 }]}>{review.reply.comment}</Text>
        </View>
      ) : null}

      {text !== null ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[12] }}>
            <Bot size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            <Text style={meta}>{t("reviews.replyDraft")}</Text>
          </View>
          <TextInput value={text} onChangeText={setText} multiline maxLength={4000} accessibilityLabel={t("reply.draftLabel")} style={styles.input} />
          <View style={[styles.rowBetween, { paddingTop: space[8] }]}>
            <TextButton label={t("reviews.cancel")} onPress={() => setText(null)} />
            <ActionButton label={t("reviews.postReply")} disabled={busy !== null || !text.trim()} onPress={() => void post()} />
          </View>
          <Text style={[meta, { paddingTop: space[8] }]}>{t("reply.approvalBody")}</Text>
        </>
      ) : (
        <View style={{ flexDirection: "row", gap: space[8], paddingTop: space[8] }}>
          <TextButton label={t(review.reply ? "reviews.editReply" : "reviews.draftReply")} disabled={busy !== null} onPress={() => (review.reply ? setText(review.reply.comment) : void draft())} />
          {busy === "draft" ? <ActivityIndicator color={color.primary} /> : null}
        </View>
      )}
      {posted ? <Text style={[metaInk, { paddingTop: space[8] }]}>{t("reviews.replied")}</Text> : null}
      {error ? <Text style={[meta, { color: color.error, paddingTop: space[8] }]}>{error}</Text> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  reply: { marginTop: space[12], padding: space[12], borderRadius: radius.control, backgroundColor: mc.iconCircle },
  input: { ...type.body, fontSize: 14, minHeight: 100, textAlignVertical: "top", marginTop: space[8], padding: space[12], borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
});
