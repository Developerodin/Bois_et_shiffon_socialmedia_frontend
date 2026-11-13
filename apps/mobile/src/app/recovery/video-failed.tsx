import { useCallback, useEffect, useState } from "react";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, RotateCcw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PageLoading } from "@/ui/page-loading";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import { formatNumber } from "@/i18n";
import { color, radius, space } from "@/theme/tokens";
import { Footer } from "@/ui/layout";
import { ActionButton, BrandPill, ICON, Panel, Tag, meta, metaInk, strong14 } from "@/ui/reels/kit";
import { startRender } from "@/ui/reels/render-watch";
import { useReel } from "@/ui/reels/use-reel";
import { ErrorHero, RecoveryTopBar, rx } from "@/ui/recovery/parts";
import { openLowCredits } from "@/ui/recovery/open";
import { isPlanRequired } from "@/ui/plans/use-plan";
import { reelSeconds } from "@/api/endpoints";

/**
 * X01 · Recovery / Video failed: the open reel's last render stopped. Says why in plain words (never the provider's
 * message), shows the credits it gave back, and offers Try again (same price) or Edit storyboard.
 * R05 hands over here when a render fails; the ready banner and Results reach it through R05.
 */
export default function VideoFailed() {
  const { t } = useTranslation("recovery");
  const { id, detail, load } = useReel();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/reels"));
  // No reel open (a cold start or a link straight here): the Results list has every render.
  useEffect(() => {
    if (!id) router.replace("/reels/results");
  }, [id]);
  // Back from Edit storyboard (a new plan version or price): read the reel again before Try again uses it.
  useFocusEffect(useCallback(() => void load(), [load]));

  const render = detail?.renders[0];
  // Only a failed render belongs here (an old link, or it was retried meanwhile): go where the reel is now.
  useEffect(() => {
    if (!detail) return;
    if (!render) router.replace("/reels/storyboard");
    else if (render.step === "DONE") router.replace("/reels/review");
    else if (render.step !== "FAILED") router.replace("/reels/generating");
  }, [detail, render]);
  const plan = detail?.plan;
  const price = detail?.price ?? 0;
  // The failed attempt's own charge (the plan may have changed price since); Try again costs today's price.
  const refunded = detail?.renders[0]?.credits ?? price;
  const credits = { count: refunded, n: formatNumber(refunded) };
  const again = { count: price, n: formatNumber(price) };
  const failure = render?.failure;
  const photo = plan ? detail?.photoUrls[plan.scenes[0]?.photoKey] : undefined;
  const details = [
    { key: "failedAt", value: t(`videoFailed.details.stages.${failure?.stoppedAt ?? "VOICE"}`) },
    { key: "reserved", value: t("credits", credits) },
    { key: "released", value: t("credits", credits) },
  ] as const;

  const retry = async () => {
    if (!id || !detail) return;
    setRetrying(true);
    setError(null);
    try {
      await startRender(id, detail.version);
      router.replace("/reels/generating");
    } catch (e) {
      if (isPlanRequired(e)) router.push("/plans/gate");
      else if (e instanceof ApiError && e.status === 402) openLowCredits({ needed: price, title: plan?.title ?? "", meta: t("lowCredits.backdropMeta", { seconds: formatNumber(reelSeconds(detail)) }) });
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <RecoveryTopBar onBack={back} center={<BrandPill tone="white" />} />
      <ScrollView contentContainerStyle={styles.body}>
        <ErrorHero
          Icon={CircleAlert}
          title={t("videoFailed.title")}
          // The reason already says the credits are back (reels.json failure.*).
          body={failure ? t(`failure.${failure.kind}`, { ns: "reels", n: failure.scene }) : ""}
        />

        {!detail ? (
          <PageLoading />
        ) : (
          <>
            <Panel style={styles.reel}>
              <Image source={photo ? { uri: photo } : undefined} style={styles.thumb} contentFit="cover" accessibilityLabel={plan?.scenes[0]?.shot} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.row}>
                  <Text style={[strong14, { flex: 1 }]} numberOfLines={1}>
                    {plan?.title}
                  </Text>
                  <Tag label={t("videoFailed.failed")} tone="grey" />
                </View>
                <Text style={meta}>{t("videoFailed.facts", { seconds: formatNumber(reelSeconds(detail)), count: plan?.scenes.length ?? 0 })}</Text>
                <View style={[styles.row, { gap: space[8], paddingTop: 4 }]}>
                  <CircleCheck size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                  <Text style={meta}>{t("videoFailed.released", credits)}</Text>
                </View>
              </View>
            </Panel>

            <Panel style={styles.impact}>
              <View style={[styles.row, styles.impactRow]}>
                <Text style={meta}>{t("videoFailed.impact")}</Text>
                {/* A failed render is always refunded in full (apps/web/server/reels/render.ts failRender). */}
                <Text style={metaInk}>{t("videoFailed.used", { count: 0, n: formatNumber(0) })}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={[styles.row, styles.details]}>
                <Text style={[metaInk, { flex: 1 }]}>{t("videoFailed.viewDetails")}</Text>
                {open ? <ChevronUp size={20} color={color.ink} strokeWidth={ICON.strokeWidth} /> : <ChevronDown size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />}
              </Pressable>
              {open ? (
                <View style={{ gap: space[8], paddingBottom: space[16] }}>
                  {details.map((d) => (
                    <View key={d.key} style={styles.row}>
                      <Text style={[meta, { flex: 1 }]}>{t(`videoFailed.details.${d.key}`)}</Text>
                      <Text style={metaInk}>{d.value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Panel>
          </>
        )}
      </ScrollView>
      <Footer>
        {error ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
        <ActionButton
          label={retrying ? t("videoFailed.retrying") : detail ? t("videoFailed.tryAgain", again) : t("videoFailed.tryAgainPlain")}
          leading={RotateCcw}
          disabled={!detail || retrying}
          onPress={() => void retry()}
        />
        {failure?.kind === "voiceDeleted" ? (
          <ActionButton label={t("reels:script.changeVoice")} variant="outline" onPress={() => router.push("/reels/voices")} />
        ) : (
          <ActionButton label={t("videoFailed.editStoryboard")} variant="outline" onPress={() => router.push("/reels/storyboard")} />
        )}
      </Footer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rx.page },
  body: { paddingHorizontal: space[20], paddingTop: space[32], paddingBottom: space[24] },
  row: { flexDirection: "row", alignItems: "center" },
  reel: { marginTop: space[32], flexDirection: "row", alignItems: "center", gap: space[16], borderColor: rx.hairline },
  thumb: { width: 64, height: 64, borderRadius: radius.control, borderWidth: 1, borderColor: rx.hairline, backgroundColor: "#EEE" },
  impact: { marginTop: space[16], paddingVertical: 0, borderColor: rx.hairline },
  impactRow: { justifyContent: "space-between", paddingVertical: space[16], borderBottomWidth: 1, borderBottomColor: "#F0EFF4" },
  details: { minHeight: 52 },
});
