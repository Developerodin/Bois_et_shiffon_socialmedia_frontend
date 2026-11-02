import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, Link2, LoaderCircle, Play, Plus, RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "@/api/client";
import { type ReelSummary, reels } from "@/api/endpoints";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { ActionButton, BottomNav, Chip, ICON, ModuleHeader, Panel, ReelsScreen, bodyMuted, meta, metaInk, rc } from "@/ui/reels/kit";
import { openReel } from "@/ui/reels/use-reel";

/** Progress shown per render step; Higgsfield reports no percentage, so this moves by step. */
const STEP_PERCENT = { VOICE: 0.15, CLIPS: 0.6, JOIN: 0.9 } as const;
const isRunning = (r: ReelSummary) => !!r.render && r.render.step in STEP_PERCENT;
const FILTERS = ["all", "ready", "processing"] as const;

/** R06 · Reels / Results. */
export default function ReelsResults() {
  const { t } = useTranslation("reels");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [list, setList] = useState<ReelSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<ReelSummary | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const refresh = useCallback(() => reels.list().then((r) => setList(r.reels), (e: unknown) => setError(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000); // processing cards move on their own
    return () => clearInterval(timer);
  }, [refresh]);

  const counts = { all: list?.length ?? 0, ready: list?.filter((r) => r.videoUrl).length ?? 0, processing: list?.filter(isRunning).length ?? 0 };
  const shown = (list ?? []).filter((r) => filter === "all" || (filter === "ready" ? !!r.videoUrl : isRunning(r)));
  const open = (r: ReelSummary, to: "/reels/review" | "/reels/generating" | "/reels/storyboard") => (openReel(r.id), router.push(to));
  const retry = async (r: ReelSummary) => {
    setRetrying(r.id);
    try {
      await reels.render(r.id, r.version);
      open(r, "/reels/generating");
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) router.push("/plans/reels");
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <ReelsScreen header={<ModuleHeader />} footer={<BottomNav active="results" />} contentStyle={{ gap: space[16] }}>
      <View style={styles.titleRow}>
        <Text style={type.pageTitle}>{t("results.title")}</Text>
        <ActionButton label={t("results.newReel")} leading={Plus} onPress={() => router.push("/reels")} />
      </View>
      <View style={{ flexDirection: "row", gap: space[8], paddingTop: 2, paddingBottom: 4 }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={t(`results.filter.${f}`, { n: counts[f] })} selected={f === filter} onPress={() => setFilter(f)} />
        ))}
      </View>
      {error ? <Text style={[meta, { color: color.error }]}>{error}</Text> : null}
      {list === null ? <ActivityIndicator color={color.primary} style={{ marginTop: space[24] }} /> : null}
      {list?.length === 0 ? <Text style={bodyMuted}>{t("results.empty")}</Text> : null}

      <View style={{ gap: space[16], paddingTop: 4 }}>
        {shown.map((r) => {
          if (isRunning(r)) {
            const p = STEP_PERCENT[r.render!.step as keyof typeof STEP_PERCENT];
            const percent = formatNumber(p, { style: "percent" });
            return (
              <Panel key={r.id}>
                <View style={styles.processingHead}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
                    <View style={styles.pulse} />
                    <Text style={metaInk}>{t("results.processing", { count: r.price ?? 0 })}</Text>
                  </View>
                  <Text style={meta}>{t("inProgress")}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("results.renderingA11y", { title: r.title, percent })}
                  onPress={() => open(r, "/reels/generating")}
                  style={{ flexDirection: "row", gap: space[16], paddingTop: space[12] }}
                >
                  <View style={styles.thumb}>
                    <Image source={r.thumbUrl ? { uri: r.thumbUrl } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={2} />
                    <View style={[StyleSheet.absoluteFill, styles.thumbShade, { backgroundColor: "rgba(0,0,0,0.2)" }]}>
                      <LoaderCircle size={16} color={color.primary} strokeWidth={ICON.strokeWidth} />
                    </View>
                  </View>
                  <View style={{ flex: 1, justifyContent: "space-between", paddingVertical: 2 }}>
                    <View>
                      <Text style={styles.cardTitle}>{r.title}</Text>
                      <Text style={[bodyMuted, { paddingTop: 2 }]}>{t("results.renderingMeta", { seconds: r.seconds ?? 0 })}</Text>
                    </View>
                    <View style={{ paddingTop: space[8] }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={meta}>{t("results.renderingStage")}</Text>
                        <Text style={metaInk}>{percent}</Text>
                      </View>
                      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}>
                        <View style={[styles.fill, { width: `${Math.round(p * 100)}%` }]} />
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Panel>
            );
          }
          const failed = r.render?.step === "FAILED" && !r.videoUrl;
          const downloaded = r.status === "APPROVED" && !r.postUrl;
          const metaLine = r.postUrl
            ? t("results.posted")
            : failed
              ? t("results.failedShort")
              : r.videoUrl
                ? t("results.readyMeta", { seconds: r.seconds ?? 0 })
                : t("results.draftMeta", { seconds: r.seconds ?? 0 });
          return (
            <Panel key={r.id}>
              <View style={{ flexDirection: "row", gap: space[16] }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("results.previewA11y", { title: r.title })}
                  onPress={() => open(r, r.videoUrl ? "/reels/review" : "/reels/storyboard")}
                  style={styles.thumb}
                >
                  <Image source={r.thumbUrl ? { uri: r.thumbUrl } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {r.videoUrl ? (
                    <View style={[StyleSheet.absoluteFill, styles.thumbShade]}>
                      <View style={styles.play}>
                        <Play size={16} color={color.ink} strokeWidth={ICON.strokeWidth} style={{ marginLeft: 2 }} />
                      </View>
                    </View>
                  ) : null}
                </Pressable>
                <View style={{ flex: 1, paddingVertical: 2 }}>
                  <Text style={styles.cardTitle}>{r.title}</Text>
                  <Text style={[bodyMuted, { paddingTop: 2, color: failed ? color.error : color.inkSecondary }]}>{metaLine}</Text>
                  {downloaded ? (
                    <Pressable accessibilityRole="button" onPress={() => setLinkFor(r)} style={styles.review}>
                      <Link2 size={18} color={color.ink} strokeWidth={ICON.strokeWidth} />
                      <Text style={[type.label, { fontFamily: font.semibold }]}>{t("results.addLink")}</Text>
                    </Pressable>
                  ) : failed ? (
                    <Pressable accessibilityRole="button" disabled={retrying === r.id} onPress={() => void retry(r)} style={styles.review}>
                      {retrying === r.id ? <ActivityIndicator color={color.primary} /> : <RotateCcw size={18} color={color.ink} strokeWidth={ICON.strokeWidth} />}
                      <Text style={[type.label, { fontFamily: font.semibold }]}>{t("results.tryAgain", { count: r.price ?? 0 })}</Text>
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" onPress={() => open(r, r.videoUrl ? "/reels/review" : "/reels/storyboard")} style={styles.review}>
                      <Text style={[type.label, { fontFamily: font.semibold }]}>{r.videoUrl ? t("results.reviewVideo") : t("results.openPlan")}</Text>
                      <ArrowRight size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
                    </Pressable>
                  )}
                </View>
              </View>
            </Panel>
          );
        })}
      </View>
      <LinkSheet reel={linkFor} onClose={() => setLinkFor(null)} onSaved={() => (setLinkFor(null), refresh())} />
    </ReelsScreen>
  );
}

/** "Posted it? Add link": the Instagram link of a reel posted by hand, so its results can be followed. */
function LinkSheet({ reel, onClose, onSaved }: { reel: ReelSummary | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation("reels");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!reel) return;
    setBusy(true);
    setError(null);
    try {
      await reels.registerLink(reel.id, url);
      setUrl("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={!!reel} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t("results.closeSheet")} />
      <View style={styles.sheet}>
        <Text style={type.feature}>{t("results.linkTitle")}</Text>
        <Text style={[bodyMuted, { paddingTop: 4 }]}>{t("results.linkBody")}</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://www.instagram.com/reel/…"
          placeholderTextColor={color.inkMuted}
          accessibilityLabel={t("results.linkTitle")}
          style={styles.linkInput}
        />
        {error ? <Text style={[meta, { color: color.error, paddingTop: space[8] }]}>{error}</Text> : null}
        <View style={{ paddingTop: space[16] }}>
          <Button label={busy ? t("results.saving") : t("results.saveLink")} onPress={() => void save()} disabled={busy || !url.trim()} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 },
  processingHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: space[12],
    borderBottomWidth: 1,
    borderBottomColor: rc.hairline,
  },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: rc.black, boxShadow: "0 0 0 1px rgba(16,16,20,0.2)" },
  thumb: { width: 80, height: 112, borderRadius: radius.control, overflow: "hidden", backgroundColor: "#F4F2FD" },
  thumbShade: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  play: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  previewTag: { position: "absolute", top: 4, left: 4, paddingHorizontal: space[8], borderRadius: radius.badge, backgroundColor: rc.dark },
  cardTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.24, color: color.ink },
  track: { marginTop: 4, height: 6, borderRadius: radius.control, backgroundColor: "#EEEDF7", overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.control, backgroundColor: rc.black },
  review: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, alignSelf: "flex-start", marginTop: space[8] },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { padding: space[24], paddingBottom: space[32], backgroundColor: color.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  linkInput: { marginTop: space[16], minHeight: 48, paddingHorizontal: space[12], borderWidth: 1, borderColor: color.controlOutline, borderRadius: radius.control, fontFamily: font.regular, fontSize: 16, color: color.ink },
});
