import { Image } from "expo-image";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { PageLoading } from "@/ui/page-loading";
import { ApiError } from "@/api/client";
import { reels, type ReelOptions } from "@/api/endpoints";
import { color, radius, space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { isPlanRequired } from "@/ui/plans/use-plan";
import { openLowCredits } from "@/ui/recovery/open";
import { BackTitle, BrandPill, PageHeader, ReelsScreen, Tag, meta, rc, strong14 } from "@/ui/reels/kit";
import { photos } from "@/ui/reels/sample";
import { useReel } from "@/ui/reels/use-reel";

/** A card's picture until its preview exists (the generic previews are made once, server side). */
const COVER: Record<string, number> = {
  spotlight: photos.table,
  collection: photos.tv,
  material: photos.tableDetail,
  arrival: photos.tableStaged,
  "three-uses": photos.diningInterior,
  "detail-to-room": photos.tableDetail,
};
const POLL_MS = 10_000;

/** R12 · Reels / Templates. */
export default function ReelsTemplates() {
  const { t } = useTranslation("reels");
  const [options, setOptions] = useState<ReelOptions | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const { id, busy, error, chat } = useReel();
  const [loadError, setLoadError] = useState<string | null>(null);
  const tpl = options?.templates.find((x) => x.id === selected) ?? options?.templates[0];
  // Only a tapped card plays its clip; the grid shows posters.
  const playing = selected && tpl?.preview ? tpl.preview : null;
  const player = useVideoPlayer(playing ? { uri: playing.videoUrl, useCaching: true } : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // `round` bumps to load again: after asking for a preview, and every 10 s while one is being made.
  const [round, setRound] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    reels.options(ctrl.signal).then(
      (o) => (setOptions(o), setLoadError(null)),
      (e: unknown) => !ctrl.signal.aborted && setLoadError(e instanceof Error ? e.message : String(e)),
    );
    return () => ctrl.abort();
  }, [round]);
  const making = !!options?.templates.some((x) => x.making);
  useEffect(() => {
    if (!making) return;
    const timer = setInterval(() => setRound((r) => r + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [making]);

  const title = (x: string) => t(`templates.item.${x}.title`, { defaultValue: x });
  // A template is an instruction to the scriptwriter: it reshapes the open plan, or starts a new one.
  const use = async () => {
    if (tpl && (await chat(title(tpl.id), undefined, { templateId: tpl.id }))) router.push(id ? "/reels/storyboard" : "/reels/chat");
  };
  const preview = async () => {
    if (!tpl || !options) return;
    setAsking(true);
    setPreviewError(null);
    try {
      await reels.preview(tpl.id);
      setRound((r) => r + 1);
    } catch (e) {
      if (isPlanRequired(e)) router.push("/plans");
      else if (e instanceof ApiError && e.status === 402) openLowCredits({ needed: options.previewCredits, title: title(tpl.id), backdrop: t("templates.title") });
      else setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  const note = !tpl ? null : tpl.making ? t("templates.previewMaking") : !options?.canPreview ? t("templates.previewNoPhotos") : tpl.failed ? t("templates.previewFailed") : null;
  const errors = [error, previewError, options ? loadError : null].filter(Boolean);
  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("templates.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
      footer={
        <Footer>
          {errors.map((e) => (
            <Text key={e} style={[meta, { color: color.error, textAlign: "center" }]}>
              {e}
            </Text>
          ))}
          {note ? <Text style={[meta, { textAlign: "center" }]}>{note}</Text> : null}
          <Button
            variant="outline"
            label={options ? t("templates.previewMine", { count: options.previewCredits }) : t("templates.previewMine_other", { count: "…" })}
            disabled={!tpl || !options?.canPreview || tpl.making || asking}
            loading={asking}
            onPress={() => void preview()}
          />
          <Button label={busy ? t("templates.applying") : t("templates.useTemplate")} arrow disabled={busy || !tpl} onPress={() => void use()} />
        </Footer>
      }
    >
      {/* Search and filters have no backend yet: said once, instead of controls that do nothing. */}
      <Text style={meta}>{t("templates.searchSoon")}</Text>
      {!options && !loadError ? <PageLoading photo /> : null}
      {!options && loadError ? (
        <View style={{ paddingTop: space[24], gap: space[12] }}>
          <Text style={[meta, { color: color.error, textAlign: "center" }]}>{t("templates.loadFailed")}</Text>
          <Button variant="outline" label={t("common:crash.retry")} onPress={() => (setLoadError(null), setRound((r) => r + 1))} />
        </View>
      ) : null}
      <View style={styles.grid}>
        {options?.templates.map((x) => {
          const on = x.id === tpl?.id;
          const subtitle = t(`templates.item.${x.id}.subtitle`, { defaultValue: "" });
          const duration = t("secondsShort", { seconds: x.seconds });
          return (
            <Pressable
              key={x.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={[t("templates.itemA11y", { title: title(x.id), subtitle, duration }), x.making ? t("templates.makingA11y") : "", x.own ? t("templates.ownPreview") : ""].filter(Boolean).join(", ")}
              onPress={() => setSelected(x.id)}
              style={[styles.card, on && styles.cardOn]}
            >
              <View style={styles.thumb}>
                <Image
                  source={x.preview ? { uri: x.preview.posterUrl, cacheKey: x.preview.posterKey } : (COVER[x.id] ?? photos.table)}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
                {on && playing ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} /> : null}
                <Tag label={duration} tone="dark" style={styles.duration} />
                {x.making ? <ActivityIndicator style={styles.making} color={color.onPrimary} accessibilityLabel={t("templates.makingA11y")} /> : null}
                {on ? (
                  <View style={styles.check}>
                    <Check size={14} color={color.onPrimary} strokeWidth={2.25} />
                  </View>
                ) : null}
              </View>
              <Text style={[strong14, { paddingTop: space[8] }]}>{title(x.id)}</Text>
              {subtitle ? <Text style={[meta, { paddingTop: 2 }]}>{subtitle}</Text> : null}
              {x.own ? <Text style={[meta, { paddingTop: 2, color: color.primary }]}>{t("templates.ownPreview")}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[16], paddingTop: space[16] },
  card: {
    width: "47.5%",
    flexGrow: 1,
    padding: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "#E4E3E9",
    borderRadius: radius.card,
  },
  cardOn: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary, padding: 11 },
  thumb: { height: 128, borderRadius: radius.control, overflow: "hidden", backgroundColor: rc.tagGrey, borderWidth: 1, borderColor: rc.fieldBorder },
  duration: { position: "absolute", top: 7, left: 7 },
  making: { position: "absolute", bottom: 8, right: 8 },
  check: { position: "absolute", top: 7, right: 7, width: 20, height: 20, borderRadius: 10, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
});
