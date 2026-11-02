import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowLeft, Check, Clock, Coins, Info, LoaderCircle, X } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { reels } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { color, radius, space, type } from "@/theme/tokens";
import { ActionButton, BrandPill, ICON, PageHeader, ReelsScreen, Tag, bodyMuted, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { photos } from "@/ui/reels/sample";
import { useReel } from "@/ui/reels/use-reel";

const ORDER = ["VOICE", "CLIPS", "JOIN"] as const;

/**
 * R05 · Reels / Generating. Polls the render; the three designed rows are its voice, clips and join steps.
 * A failed render says what happened in plain words (never the provider's message), marks the step it stopped at,
 * and offers Try again and Edit plan.
 */
export default function ReelsGenerating() {
  const { t } = useTranslation("reels");
  const { id, detail } = useReel(3000);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const render = detail?.renders[0];
  const plan = detail?.plan;
  const title = plan?.title ?? "";
  const failure = render?.step === "FAILED" ? render.failure : null;
  const failed = render?.step === "FAILED";
  const at = !render ? 0 : render.step === "DONE" ? 3 : failed ? ORDER.indexOf(failure?.stoppedAt ?? "VOICE") : ORDER.indexOf(render.step as (typeof ORDER)[number]);
  const retry = async () => {
    if (!id || !detail) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await reels.render(id, detail.version);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) router.push("/plans/reels");
      else setRetryError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  };
  useEffect(() => {
    if (render?.step === "DONE") router.replace("/reels/review");
  }, [render?.step]);
  // No reel open (a cold start or a link straight here): the Results list has every render.
  useEffect(() => {
    if (!id) router.replace("/reels/results");
  }, [id]);
  const row = (i: number, label: string) => {
    const done = at > i;
    const now = at === i && !failed;
    const stopped = at === i && failed;
    return (
      <Step
        icon={
          stopped ? (
            <View style={[styles.stepIcon, { borderColor: color.error }]}>
              <X size={14} color={color.error} strokeWidth={2.25} />
            </View>
          ) : done ? (
            <View style={[styles.stepIcon, { backgroundColor: rc.black, borderColor: rc.black }]}>
              <Check size={14} color={color.onPrimary} strokeWidth={2.25} />
            </View>
          ) : now ? (
            <View style={[styles.stepIcon, { borderColor: rc.black }]}>
              <LoaderCircle size={16} color={color.primary} strokeWidth={ICON.strokeWidth} />
            </View>
          ) : (
            <View style={[styles.stepIcon, { borderColor: "#C8C5CB" }]}>
              <Clock size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            </View>
          )
        }
        label={<Text style={now || stopped ? strong14 : done ? metaInk : meta}>{label}</Text>}
        status={
          stopped ? (
            <Text style={[meta, { color: color.error }]}>{t("generating.stopped")}</Text>
          ) : done ? (
            <Text style={meta}>{t("generating.done")}</Text>
          ) : now ? (
            <Tag label={t("inProgress")} textStyle={{ color: color.ink }} />
          ) : (
            <Text style={meta}>{failed ? t("generating.notStarted") : t("generating.queued")}</Text>
          )
        }
      />
    );
  };
  return (
    <ReelsScreen
      header={
        <PageHeader
          left={
            <Pressable accessibilityRole="button" onPress={() => router.replace("/reels")} style={styles.backWorkspace}>
              <ArrowLeft size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
              <Text style={type.label}>{t("generating.backToWorkspace")}</Text>
            </Pressable>
          }
          right={<BrandPill tone="white" />}
        />
      }
      contentStyle={{ flexGrow: 1, justifyContent: "space-between", paddingTop: space[8], paddingBottom: space[24] }}
    >
      <View style={{ alignItems: "center", paddingTop: space[8] }}>
        <View style={styles.ringBox} accessibilityLabel={t("generating.renderingA11y")}>
          <View style={[styles.ring, failed && { borderColor: color.error }]} />
          <View style={styles.core}>
            <Image source={photos.mark} style={{ width: 48, height: 48 }} contentFit="contain" />
          </View>
        </View>
        <Text style={[type.pageTitle, { textAlign: "center", paddingTop: space[12] }]}>{failed ? t("generating.failedTitle") : t("generating.title")}</Text>
        <Text style={[bodyMuted, { textAlign: "center", paddingTop: 4, maxWidth: 300 }]} accessibilityLiveRegion="polite">
          {failed ? t(`failure.${failure?.kind ?? "other"}`, { n: failure?.scene }) : detail ? t("generating.bodyAny", { title }) : ""}
        </Text>
      </View>

      <View style={[styles.card, { marginTop: space[16] }]}>
        <View style={styles.product}>
          <Image source={plan && detail?.photoUrls[plan.scenes[0].photoKey] ? { uri: detail.photoUrls[plan.scenes[0].photoKey] } : undefined} style={[styles.thumb, { backgroundColor: rc.tagGrey }]} contentFit="cover" />
          <View style={{ flex: 1 }}>
            {detail ? (
              <>
                <Text style={strong14}>{t("generating.summary", { title, seconds: detail.price ? detail.price / 2 : 0 })}</Text>
                <Text style={[meta, { paddingTop: 2 }]}>{t("storyboard.voiceover", { lang: (plan?.language ?? "fr").toUpperCase() })}</Text>
              </>
            ) : (
              <ActivityIndicator color={color.primary} style={{ alignSelf: "flex-start" }} />
            )}
          </View>
        </View>
        {detail ? (
          <View style={{ gap: space[12], paddingTop: 2 }}>
            {row(0, t("generating.preparingScenes", { count: plan?.scenes.length ?? 0 }))}
            {row(1, t("generating.renderingFrames"))}
            {row(2, t("generating.addingAudio"))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: space[12], paddingTop: space[12] }}>
        {detail ? (
          <View style={styles.credits}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
              <Coins size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
              <Text style={metaInk}>{failed ? t("generating.creditsRefunded", { count: detail.price ?? 0 }) : t("generating.creditsReserved", { count: detail.price ?? 0 })}</Text>
            </View>
            <Text style={meta}>{t("generating.remaining", { count: detail.credits })}</Text>
          </View>
        ) : null}
        {failed ? null : (
          <View style={{ flexDirection: "row", gap: space[8], paddingHorizontal: space[8] }}>
            <Info size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} style={{ marginTop: 2 }} />
            <Text style={[bodyMuted, { flex: 1 }]}>{t("generating.safeToLeave")}</Text>
          </View>
        )}
      </View>

      <View style={{ gap: space[12], paddingTop: space[16] + 4, paddingBottom: 4 }}>
        {retryError ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{retryError}</Text> : null}
        {failed ? (
          <>
            <Button label={retrying ? t("generating.retrying") : t("generating.tryAgain")} disabled={retrying} onPress={() => void retry()} />
            <ActionButton label={t("generating.editPlan")} variant="outline" onPress={() => router.replace("/reels/chat")} />
          </>
        ) : (
          <Button label={t("generating.keepWorking")} onPress={() => router.replace("/reels/results")} />
        )}
      </View>
    </ReelsScreen>
  );
}

function Step({ icon, label, status }: { icon: ReactNode; label: ReactNode; status: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[12] }}>
        {icon}
        {label}
      </View>
      {status}
    </View>
  );
}

const styles = StyleSheet.create({
  backWorkspace: { flexDirection: "row", alignItems: "center", gap: space[8], minHeight: 44 },
  ringBox: { width: 112, height: 112, marginVertical: 4, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: rc.black,
    backgroundColor: "rgba(255,255,255,0.93)",
  },
  core: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.7)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
  },
  card: {
    gap: space[16],
    padding: space[16],
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 20,
    boxShadow: "0 2px 12px rgba(0,0,0,0.03)",
  },
  product: { flexDirection: "row", alignItems: "center", gap: space[12], paddingBottom: space[12], borderBottomWidth: 1, borderBottomColor: rc.hairline },
  thumb: { width: 48, height: 48, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(232,231,237,0.6)" },
  stepIcon: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  credits: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[12],
    paddingHorizontal: space[16],
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
  },
});
