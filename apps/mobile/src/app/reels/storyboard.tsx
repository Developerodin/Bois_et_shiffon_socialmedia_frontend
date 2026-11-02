import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowDown, Lock, Sparkles, TriangleAlert, Volume2 } from "lucide-react-native";
import { Fragment, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { color, radius, space, type } from "@/theme/tokens";
import { Footer } from "@/ui/layout";
import { ActionButton, BackButton, HeaderTitle, ICON, PageHeader, ReelsScreen, Tag, bodyMuted, eyebrow, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { startRender } from "@/ui/reels/render-watch";
import { useReel } from "@/ui/reels/use-reel";
import { openLowCredits } from "@/ui/recovery/open";
import { isPlanRequired } from "@/ui/plans/use-plan";

/** Which video model the director routed each scene to (apps/web/server/reels/router.ts). */
const MODEL_NAMES: Record<string, string> = { "kling-3-std": "Kling 3.0", "seedance-2.5": "Seedance 2.5", "hailuo-2.3": "Hailuo 2.3" };
const sceneSeconds = (voice: string) => Math.min(15, Math.max(3, Math.ceil(voice.trim().split(/\s+/).filter(Boolean).length / 2)));

/** R03 · Reels / Storyboard. "Make video" charges the shown price and starts the render. */
export default function ReelsStoryboard() {
  const { t } = useTranslation("reels");
  const { id, detail, error, setError } = useReel();
  const [starting, setStarting] = useState(false);
  const plan = detail?.plan;
  const price = detail?.price ?? 0;
  const seconds = plan ? plan.scenes.reduce((n, s) => n + sceneSeconds(s.voiceText), 0) : 0;
  const rendering = detail?.renders.some((r) => r.step !== "DONE" && r.step !== "FAILED");
  // The server refuses to render a stand-in photo (another product); send the person to R13 instead.
  const standIns = plan?.scenes.filter((s) => s.standIn).length ?? 0;

  const make = async () => {
    if (!id || !detail) return;
    if (rendering) return router.push("/reels/generating");
    if (standIns) return router.push("/reels/assets");
    setStarting(true);
    try {
      await startRender(id, detail.version);
      router.push("/reels/generating");
    } catch (e) {
      if (isPlanRequired(e)) router.push("/plans/gate");
      else if (e instanceof ApiError && e.status === 402) openLowCredits({ needed: detail.price ?? 0, title: plan?.title ?? "", backdrop: t("storyboard.title") });
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  if (!plan) {
    return (
      <ReelsScreen header={<PageHeader left={<BackButton label={t("goBack")} />} center={<HeaderTitle center>{t("storyboard.title")}</HeaderTitle>} />}>
        {error ? <Text style={[bodyMuted, { color: color.error }]}>{error}</Text> : <ActivityIndicator style={{ marginTop: space[32] }} color={color.primary} />}
      </ReelsScreen>
    );
  }

  const facts = [t("storyboard.durationFact", { seconds }), t("storyboard.verticalFact"), t("noPresenter"), t("scene.count", { count: plan.scenes.length })];
  return (
    <ReelsScreen
      header={
        <PageHeader
          left={<BackButton label={t("goBack")} />}
          center={<HeaderTitle center>{t("storyboard.title")}</HeaderTitle>}
          right={
            <View style={styles.productPill}>
              <View style={styles.dot} />
              <Text style={metaInk} numberOfLines={1}>{plan.scenes[0].shot}</Text>
            </View>
          }
        />
      }
      contentStyle={{ paddingTop: 12, paddingBottom: space[24] }}
      footer={
        <Footer>
          {error ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: space[12] }}>
            <ActionButton label={t("storyboard.editInChat")} variant="ghost" leading={Sparkles} onPress={() => router.push("/reels/chat")} style={{ paddingHorizontal: space[16] }} />
            <ActionButton
              style={{ flex: 1 }}
              disabled={starting}
              accessibilityLabel={standIns && !rendering ? t("storyboard.pickPhotos") : t("storyboard.makeVideoA11y", { count: price })}
              onPress={() => void make()}
              label={
                starting ? (
                  <ActivityIndicator color={color.onPrimary} />
                ) : standIns && !rendering ? (
                  <Text style={[type.label, { color: color.onPrimary }]}>{t("storyboard.pickPhotos")}</Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
                    <Text style={[type.label, { color: color.onPrimary }]}>{rendering ? t("storyboard.seeProgress") : t("storyboard.makeVideo")}</Text>
                    {rendering ? null : <View style={styles.sep} />}
                    {rendering ? null : <Text style={[type.label, { color: color.onPrimary }]}>{t("storyboard.cost", { count: price })}</Text>}
                  </View>
                )
              }
            />
          </View>
          <Text style={[bodyMuted, { textAlign: "center" }]}>{t("storyboard.balance", { balance: detail.credits, count: price })}</Text>
        </Footer>
      }
    >
      <Text style={type.pageTitle}>{plan.title}</Text>
      <View style={styles.facts}>
        {facts.map((f) => (
          <Tag key={f} label={f} style={styles.fact} />
        ))}
      </View>
      <View style={styles.ready}>
        {standIns ? <TriangleAlert size={16} color={color.error} strokeWidth={ICON.strokeWidth} /> : <Lock size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />}
        <Text style={metaInk}>
          {standIns ? (
            <Trans t={t} ns="reels" i18nKey="storyboard.needsPhotos" count={standIns} components={{ muted: <Text style={meta} /> }} />
          ) : (
            <Trans t={t} ns="reels" i18nKey="storyboard.readyToRender" components={{ muted: <Text style={meta} /> }} />
          )}
        </Text>
      </View>

      <View style={{ gap: space[12], paddingTop: space[24] }}>
        {plan.scenes.map((s, i) => (
          <Fragment key={i}>
            <View style={styles.scene}>
              <View style={styles.sceneHead}>
                <Text style={strong14}>{t("scene.label", { n: i + 1, seconds: sceneSeconds(s.voiceText) })}</Text>
                <Tag label={s.model ? MODEL_NAMES[s.model] ?? s.model : s.shot} />
              </View>
              <View style={{ gap: space[16], paddingTop: space[12] }}>
                <Image source={detail.photoUrls[s.photoKey] ? { uri: detail.photoUrls[s.photoKey] } : undefined} style={styles.still} contentFit="cover" accessibilityLabel={s.shot} />
                {s.standIn ? <Text style={[meta, { color: color.error }]}>{t("storyboard.standIn")}</Text> : null}
                <View>
                  <Text style={eyebrow}>{t("storyboard.sceneDirection")}</Text>
                  <Text style={type.body}>{s.direction}</Text>
                  {s.onScreenText ? <Text style={[meta, { paddingTop: 4 }]}>{t("storyboard.onScreen", { text: s.onScreenText })}</Text> : null}
                  <View style={styles.voice}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Volume2 size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                      <Text style={meta}>{t("storyboard.voiceover", { lang: (plan.language ?? "fr").toUpperCase() })}</Text>
                    </View>
                    <Text style={[bodyMuted, { paddingTop: 2 }]}>{s.voiceText}</Text>
                  </View>
                </View>
              </View>
            </View>
            {/* How this scene hands over to the next: the director plans it, so nobody has to write it. */}
            {i < plan.scenes.length - 1 && s.transition ? (
              <View style={styles.join} accessibilityLabel={t(`storyboard.join.${s.transition}`)}>
                <ArrowDown size={14} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                <Text style={meta}>{t(`storyboard.join.${s.transition}`)}</Text>
              </View>
            ) : null}
          </Fragment>
        ))}
      </View>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  productPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingVertical: 4,
    paddingHorizontal: space[12],
    borderRadius: radius.control,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#EEEDF7",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#1A1B22" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[8] },
  fact: { backgroundColor: "rgba(255,255,255,0.95)", paddingHorizontal: space[12], boxShadow: "0 1px 3px rgba(0,0,0,0.02)" },
  ready: {
    marginTop: space[12],
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingVertical: space[8],
    paddingHorizontal: space[12],
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
  },
  scene: { padding: space[16], backgroundColor: color.surface, borderWidth: 1, borderColor: rc.border, borderRadius: radius.card },
  join: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  sceneHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  still: { height: 198, borderRadius: radius.control, borderWidth: 1, borderColor: "#E8E7F1", backgroundColor: "#EEEDF7" },
  voice: { marginTop: space[8], padding: space[12], borderRadius: radius.control, backgroundColor: rc.softPanel },
  sep: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" },
});
