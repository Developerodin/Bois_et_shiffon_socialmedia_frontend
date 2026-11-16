import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Check, Clock, Globe, Share2, Store, X, type LucideIcon } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDate, formatNumber } from "@/i18n";
import { color, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { BrandPill, ICON, PageHeader, Panel, ReelsScreen, bodyMuted, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { ApiError } from "@/api/client";
import { currentBrand, postRelease, posts, type PostRelease } from "@/api/endpoints";
import { usePermissions } from "@/ui/use-permissions";
import { useReel } from "@/ui/reels/use-reel";

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** R09 · Reels / Schedule confirmation, from the reel's real slot. */
export default function ReelsScheduled() {
  const { t } = useTranslation("reels");
  const { id, detail } = useReel(5000); // Publishing now → Published without leaving the screen
  const [brandName, setBrandName] = useState("");
  const [release, setRelease] = useState<PostRelease | null>(null);
  const { can } = usePermissions();
  const [cancelling, setCancelling] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    currentBrand().then((b) => setBrandName(b.name), () => {});
  }, []);
  const status = detail?.item.status;
  const at = detail?.item.scheduledFor ? new Date(detail.item.scheduledFor) : new Date();
  // "Publish now" also lands here: only a slot still ahead is a schedule; the same screen says what is happening otherwise.
  const later = status === "SCHEDULED" && at.getTime() > Date.now() + 60_000;
  const published = status === "PUBLISHED";
  // Reels share the posts' release path (same as a post's detail screen): the scheduled attempt is what Cancel settles,
  // and the attempts say how a publish ended. Re-read with each poll of the reel until it's published.
  useEffect(() => {
    if (!id || published) return;
    postRelease(id).then(setRelease, () => {});
  }, [id, published, detail]);
  const attemptId = later ? (release?.attempts.find((a) => a.status === "SCHEDULED")?.id ?? null) : null;
  // The publish ran but the outcome is unknown (the item stays SCHEDULED): the person checks the account, as on posts.
  const uncertain = !published ? release?.attempts.find((a) => a.status === "PENDING_VERIFY") : undefined;
  // Back to APPROVED (a failed publish, or cancelled elsewhere): nothing went out; the reel can be scheduled again.
  const notOut = !!status && status !== "SCHEDULED" && status !== "PUBLISHED";
  const lastFailed = release?.attempts[0]?.status === "FAILED" ? release.attempts[0].error : null;
  const settle = async (attempt: string, action: "posted" | "not-posted") => {
    if (!id) return;
    setSettling(true);
    setError(null);
    try {
      setRelease(await posts.settle(id, attempt, action));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettling(false);
    }
  };
  const cancel = async () => {
    if (!id || !attemptId) return;
    setCancelling(true);
    setError(null);
    try {
      await posts.settle(id, attemptId, "cancel");
      router.replace("/reels/review"); // back where Schedule is open again
    } catch (e) {
      // Already cancelled (or posted) elsewhere: the review screen shows where the reel stands now.
      if (e instanceof ApiError && e.status === 409) router.replace("/reels/review");
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelling(false);
    }
  };
  const plan = detail?.plan;
  const thumb = plan ? detail?.photoUrls[plan.scenes[0].photoKey] : undefined;
  const date = t("publish.dateValue", {
    day: formatNumber(at.getDate()),
    month: formatDate(at, { month: "long" }),
    year: formatNumber(at.getFullYear(), { useGrouping: false }),
  });
  const time = formatDate(at, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={
        <PageHeader
          left={<BrandPill />}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel={t("common:close")} onPress={() => router.replace("/reels/results")} style={styles.icon44}>
              <X size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
            </Pressable>
          }
        />
      }
      contentStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
      footer={
        <Footer>
          {error ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          <Button label={t("scheduled.viewReel")} arrow onPress={() => router.push("/reels/review")} />
          {uncertain && can("publish.execute") ? (
            <View style={{ flexDirection: "row", gap: space[8] }}>
              <Button label={t("posts:detail.wasPosted")} variant="outline" height={44} style={{ flex: 1 }} disabled={settling} onPress={() => void settle(uncertain.id, "posted")} />
              <Button label={t("posts:detail.notPosted")} variant="outline" height={44} style={{ flex: 1 }} disabled={settling} onPress={() => void settle(uncertain.id, "not-posted")} />
            </View>
          ) : null}
          {attemptId && can("publish.execute") ? <Button label={cancelling ? t("scheduled.cancelling") : t("scheduled.cancelSchedule")} variant="outline" height={44} disabled={cancelling} onPress={() => void cancel()} /> : null}
          <Button label={t("scheduled.backToResults")} variant="ghost" height={44} onPress={() => router.replace("/reels/results")} />
        </Footer>
      }
    >
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(16,185,129,0.10)", "rgba(67,152,168,0.08)", "rgba(168,85,247,0.05)", "rgba(168,85,247,0)"]}
        locations={[0, 0.25, 0.5, 1]}
        style={styles.wash}
      />
      <View style={{ alignItems: "center", maxWidth: 280 }}>
        <View style={styles.badge}>
          {notOut ? <X size={28} color={color.onPrimary} strokeWidth={ICON.strokeWidth} /> : uncertain ? <Clock size={28} color={color.onPrimary} strokeWidth={ICON.strokeWidth} /> : <Check size={28} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />}
        </View>
        <Text style={[type.pageTitle, { textAlign: "center", paddingTop: space[12] }]}>{published ? t("scheduled.publishedTitle") : notOut ? t("scheduled.failedTitle") : uncertain ? t("posts:detail.checkAccount", { account: uncertain.account }) : later ? t("scheduled.title") : t("scheduled.publishingTitle")}</Text>
        <Text style={[bodyMuted, { textAlign: "center", paddingTop: 4 }]}>{published ? t("scheduled.publishedBody") : notOut ? (lastFailed ?? t("scheduled.failedBody")) : uncertain ? (uncertain.error ?? t("scheduled.checkBody")) : later ? t("scheduled.body") : t("scheduled.publishingBody")}</Text>
      </View>

      <Panel style={{ alignSelf: "stretch", marginTop: space[24] }}>
        <View style={styles.product}>
          <Image source={thumb ? { uri: thumb } : undefined} style={[styles.thumb, { backgroundColor: rc.tagGrey }]} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={strong14}>{plan?.title ?? ""}</Text>
            <Text style={meta}>{t("scheduled.meta", { seconds: (detail?.price ?? 0) / 2 })}</Text>
          </View>
        </View>
        <View style={{ paddingTop: space[16], gap: space[12] }}>
          <Row Icon={Clock} label={published ? t("scheduled.publishDateNow") : t("scheduled.publishDate")} value={<Text style={metaInk}>{t("scheduled.dateTime", { date, time })}</Text>} />
          <Row Icon={Globe} label={t("timezone")} value={<Text style={metaInk}>{TIME_ZONE}</Text>} />
          <Row Icon={Store} label={t("scheduled.brandWorkspace")} value={<Text style={metaInk}>{brandName}</Text>} />
          <Row
            Icon={Share2}
            label={t("scheduled.channel")}
            value={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={styles.dot} />
                <Text style={meta}>{t("scheduled.instagramConnected")}</Text>
              </View>
            }
          />
        </View>
      </Panel>

      {attemptId && can("publish.execute") ? <Text style={[meta, { textAlign: "center", paddingTop: space[24] }]}>{t("scheduled.editInCalendar")}</Text> : null}
    </ReelsScreen>
  );
}

function Row({ Icon, label, value }: { Icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
        <Icon size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
        <Text style={meta}>{label}</Text>
      </View>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  icon44: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  wash: { position: "absolute", top: 0, left: 0, right: 0, height: 256 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: rc.black,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 6px rgba(16,185,129,0.2), 0 10px 15px rgba(16,185,129,0.2)",
  },
  product: { flexDirection: "row", alignItems: "center", gap: space[12], paddingBottom: space[12], borderBottomWidth: 1, borderBottomColor: rc.tagGrey },
  thumb: { width: 48, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: rc.tagGrey },
});
