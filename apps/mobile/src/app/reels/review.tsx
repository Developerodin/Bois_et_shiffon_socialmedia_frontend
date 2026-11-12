import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { ArrowRight, AudioLines, CircleAlert, CircleCheck, Download, MessageSquareText, MonitorPlay, Smartphone, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { reels, type CheckResult } from "@/api/endpoints";
import { color, font, radius, space } from "@/theme/tokens";
import { Field } from "@/ui/field";
import { Footer } from "@/ui/layout";
import { ActionButton, BackButton, HeaderTitle, ICON, PageHeader, ReelsScreen, Tag, eyebrow, languageName, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { downloadReel } from "@/ui/reels/download";
import { recheckReel, useReel } from "@/ui/reels/use-reel";
import { reelSeconds } from "@/api/endpoints";

/** Statuses from which the reel may be downloaded: the checks have run (studio reels: the maker approves by sending). */
const SENDABLE = ["AWAITING_APPROVAL", "APPROVED", "SCHEDULED", "PUBLISHED"];
/** Only these can still be scheduled; a scheduled reel is changed by cancelling its schedule (R09). */
const SCHEDULABLE = ["AWAITING_APPROVAL", "APPROVED"];
/** The check normally lands within a minute; past this the screen says so and offers to run it again. */
const CHECK_SLOW_MS = 150_000;
/** No checks yet after this: ask the server to start them once (the render's own start may have been missed). */
const CHECK_AUTO_MS = 90_000;
const CHECK_ICON: Record<CheckResult["status"], LucideIcon> = { pass: CircleCheck, warn: TriangleAlert, blocker: CircleAlert };

/** R07 · Reels / Result review. Plays the reel; Download or Schedule is the approval of exactly this version. */
export default function ReelsReview() {
  const { t, i18n } = useTranslation("reels");
  const { id, detail, error, setError, change, load } = useReelWithChange();
  const [caption, setCaption] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [rechecks, setRechecks] = useState(0);
  const [slow, setSlow] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const player = useVideoPlayer(detail?.videoUrl ?? null);
  const plan = detail?.plan;
  const status = detail?.item.status;
  const blocked = detail?.checks?.overall === "BLOCKER";
  const sendable = !!status && SENDABLE.includes(status) && !blocked;
  const schedulable = !!status && SCHEDULABLE.includes(status);
  const scheduled = status === "SCHEDULED";
  const shownCaption = caption ?? detail?.caption?.caption ?? "";
  const hashtags = detail?.caption?.hashtags ?? [];
  const language = languageName(plan?.language, i18n.language);
  const context = language ? "lang" : undefined;
  // The Quality check never landed (the server retries it while this polls): say so after a while, with a way to run it again.
  const waiting = !!detail && !detail.checks && status === "DRAFT_REVIEW";
  // auto: the one try the screen makes by itself; a failure there (e.g. a viewer without the right) stays quiet.
  const recheck = async (auto = false) => {
    if (!id) return;
    setRechecking(true);
    setNotice(null);
    try {
      const r = await recheckReel(id);
      if (r.status === "checking" && !auto) setNotice(t("review.alreadyChecking"));
      await load();
      setRechecks((n) => n + 1);
    } catch (e) {
      if (!auto) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRechecking(false);
    }
  };
  useEffect(() => {
    setSlow(false);
    if (!waiting) return setNotice(null);
    const slowTimer = setTimeout(() => setSlow(true), CHECK_SLOW_MS);
    const autoTimer = rechecks === 0 ? setTimeout(() => void recheck(true), CHECK_AUTO_MS) : undefined;
    return () => (clearTimeout(slowTimer), clearTimeout(autoTimer));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recheck only reads the reel id
  }, [waiting, rechecks]);

  // The typed caption stays in the box when the save fails, so it can be sent again.
  const saveCaption = () => {
    if (!id || !detail || !plan || caption === null || caption === detail.caption?.caption) return;
    void change(() => reels.editCaption(id, detail.version, plan, caption, hashtags)).then((saved) => saved && setCaption(null));
  };
  const download = async () => {
    if (!id || !detail) return;
    setDownloading(true);
    try {
      await downloadReel(id, detail.version, plan?.title);
      await change(async () => undefined); // status is now APPROVED
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ReelsScreen
      header={<PageHeader left={<BackButton label={t("goBack")} />} center={<HeaderTitle center subtitle={t("review.subtitle")}>{plan?.title ?? ""}</HeaderTitle>} />}
      contentStyle={{ paddingTop: 0, paddingBottom: space[24] }}
      footer={
        <Footer>
          {error ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: space[12] }}>
            <ActionButton
              style={{ flex: 1, paddingHorizontal: 0 }}
              variant="outline"
              leading={Download}
              disabled={!sendable || downloading}
              label={downloading ? <ActivityIndicator color={color.ink} /> : t("review.downloadVideo")}
              onPress={() => void download()}
            />
            <ActionButton
              style={{ flex: 1, paddingHorizontal: 0 }}
              trailing={ArrowRight}
              disabled={!(sendable && (schedulable || scheduled))}
              label={scheduled ? t("review.viewSchedule") : t("schedule")}
              onPress={() => router.push(scheduled ? "/reels/scheduled" : "/reels/publish")}
            />
          </View>
          <Text style={[meta, { textAlign: "center" }]}>
            {sendable ? (scheduled ? t("review.scheduledNote") : status === "PUBLISHED" ? t("review.alreadyPublished") : t("review.connectFirst")) : blocked ? t("review.blocked") : slow ? t("review.checkSlow") : t("review.checking")}
          </Text>
        </Footer>
      }
    >
      <View style={styles.player}>
        <View style={styles.video}>
          {detail?.videoUrl ? (
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} />
          ) : (
            <ActivityIndicator style={StyleSheet.absoluteFill} color={color.onPrimary} />
          )}
          {detail?.price ? (
            <View style={styles.duration} pointerEvents="none">
              <Text style={[meta, { color: color.onPrimary }]}>{t("secondsShort", { seconds: reelSeconds(detail) })}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.formatRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <Smartphone size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
            <Text style={metaInk}>{t("review.vertical")}</Text>
          </View>
          <Tag label={t("review.portrait")} />
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push("/reels/chat")} style={styles.redo}>
        <MessageSquareText size={18} color={color.ink} strokeWidth={ICON.strokeWidth} />
        <Text style={[metaInk, { fontFamily: font.semibold }]}>{t("review.askForChanges")}</Text>
      </Pressable>

      <View style={[styles.section, { marginTop: space[16] }]}>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <Text style={strong14}>{t("review.caption", { context, language })}</Text>
            <Text style={meta}>{t("review.defaultSource")}</Text>
          </View>
          <Tag label={t("review.editable")} />
        </View>
        <View style={{ paddingTop: space[12] }}>
          <Field
            multiline
            value={shownCaption}
            onChangeText={setCaption}
            onBlur={saveCaption}
            accessibilityLabel={t("review.captionA11y", { context, language })}
            style={{ flex: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.ink, minHeight: 96, textAlignVertical: "top" }}
          />
        </View>
        <View style={styles.tags}>
          {hashtags.map((h) => (
            <Tag key={h} label={h} style={{ paddingVertical: 4, paddingHorizontal: space[12] }} textStyle={{ color: color.ink }} />
          ))}
        </View>
      </View>

      <View style={[styles.section, { marginTop: space[24] }]}>
        <Text style={eyebrow}>{t("review.checks")}</Text>
        <View style={{ paddingTop: space[16], gap: space[12] }}>
          {detail?.checks ? (
            detail.checks.results.map((c, i) => <Spec key={i} Icon={CHECK_ICON[c.status]} label={c.check} value={c.note} tone={c.status} />)
          ) : slow ? (
            <>
              <Text style={meta}>{t("review.checkSlow")}</Text>
              <ActionButton variant="outline" disabled={rechecking} label={rechecking ? t("review.checkingAgain") : t("review.checkAgain")} onPress={() => void recheck()} />
            </>
          ) : (
            <Text style={meta}>{t("review.checking")}</Text>
          )}
          {notice && !detail?.checks ? <Text style={meta}>{notice}</Text> : null}
          {/* Joins the seam check softened while rendering: the person sees why the cut became a blend. */}
          {(detail?.renders.find((r) => r.step === "DONE")?.softened ?? []).map((n) => (
            <Spec key={`join${n}`} Icon={CHECK_ICON.warn} label={t("review.joinSoftened", { n, next: n + 1 })} value={t("review.joinSoftenedNote")} tone="warn" />
          ))}
        </View>
      </View>

      <View style={[styles.section, { marginTop: space[24] }]}>
        <Text style={eyebrow}>{t("review.specifications")}</Text>
        <View style={{ paddingTop: space[16], gap: space[8] }}>
          <Spec Icon={AudioLines} label={t("review.audioTrack")} value={t("review.audioVoiceOnly", { context, language })} />
          <Spec Icon={MonitorPlay} label={t("review.resolution")} value={t("review.resolutionValue")} />
        </View>
      </View>
    </ReelsScreen>
  );
}

/** useReel polls every 5 s here, so the checks appear as soon as the Quality run finishes. */
function useReelWithChange() {
  const r = useReel(5000);
  // Resolves true once `run` went through, false (with the error shown) when it didn't.
  const change = async (run: () => Promise<unknown>) => {
    try {
      await r.load();
      await run();
      await r.load();
      return true;
    } catch (e) {
      r.setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  return { ...r, change };
}

function Spec({ Icon, label, value, tone }: { Icon: LucideIcon; label: string; value: string; tone?: CheckResult["status"] }) {
  const ink = tone === "blocker" ? color.error : tone === "warn" ? "#8A5A00" : color.inkSecondary;
  return (
    <View style={{ flexDirection: "row", gap: space[12] }}>
      <View style={styles.specIcon}>
        <Icon size={16} color={ink} strokeWidth={ICON.strokeWidth} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={meta}>{label}</Text>
        <Text style={metaInk}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  player: { backgroundColor: color.surface, borderWidth: 1, borderColor: rc.border, borderRadius: radius.card, overflow: "hidden" },
  video: { aspectRatio: 9 / 16, backgroundColor: "#171717" },
  duration: { position: "absolute", top: 14, right: 14, paddingVertical: 4, paddingHorizontal: space[12], borderRadius: 9999, backgroundColor: "rgba(26,27,36,0.8)" },
  formatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space[12], paddingHorizontal: space[16] },
  redo: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[8], minHeight: 44, marginTop: space[12] },
  section: {
    padding: space[16],
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[8], paddingTop: space[12] },
  specIcon: { width: 28, height: 28, marginTop: 2, borderRadius: radius.control, backgroundColor: "#EEEDF7", alignItems: "center", justifyContent: "center" },
});
