import { useCallback, useState } from "react";
import { Image } from "expo-image";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Redirect, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ArrowRight, ChevronLeft, Columns2, Download, Share2, Sparkle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PageLoading } from "@/ui/page-loading";
import { photoshoots, type Shoot } from "@/api/endpoints";
import { BackButton, BrandChip, Glow, HeaderIcon, ps, TopBar } from "@/ui/photoshoot/chrome";
import { Badge, IconLabelButton, Page, PhotoPill } from "@/ui/photoshoot/controls";
import { shootTitle } from "@/ui/photoshoot/describe";
import { models } from "@/ui/photoshoot/options";
import { startShoot } from "@/ui/photoshoot/start";
import { backToStory, useStoryReturn } from "@/ui/stories/generate";
import { color, radius, space, type } from "@/theme/tokens";

const ASPECT = { "1:1": 1, "4:5": 4 / 5, "9:16": 9 / 16 } as const;

/**
 * F07 · Photoshoot / Result detail: the shoot's four photos (tap a thumbnail to show it), the original beside it
 * ("Compare original"), and what was asked. Download and Share hand the shown photo to the phone's share sheet;
 * Variation runs the same setup again (charged again). Opened from a story's Generate, Use in story takes the shown
 * photo back to the story's frame.
 */
export default function ResultDetail() {
  const { t } = useTranslation("photoshoot");
  const { id } = useLocalSearchParams<{ id: string }>();
  const [shoot, setShoot] = useState<Shoot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState<"share" | "variation" | null>(null);
  const story = useStoryReturn();
  useFocusEffect(
    useCallback(() => {
      const ctrl = new AbortController();
      photoshoots.get(id, ctrl.signal).then(
        (r) => setShoot(r.shoot),
        (e: unknown) => !ctrl.signal.aborted && setError(e instanceof Error ? e.message : String(e)),
      );
      return () => ctrl.abort();
    }, [id]),
  );
  if (shoot && shoot.status !== "DONE") return <Redirect href={{ pathname: "/photoshoot/generating", params: { id: shoot.id } }} />;
  const title = shoot ? shootTitle(t, shoot) : "";
  const photo = shoot?.shots[shown] ?? shoot?.shots[0];
  const run = async (what: "share" | "variation", call: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(what);
    setError(null);
    try {
      await call();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const share = () =>
    run("share", async () => {
      if (!photo) return;
      const file = await File.downloadFileAsync(photo.url, new File(Paths.cache, photo.key.split("/").pop()!), { idempotent: true });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "image/jpeg", dialogTitle: title });
    });
  const input = shoot?.input;
  const style = !input ? "" : input.kind === "product" ? t(`product.scenes.${input.scene}`) : t(`fashion.poses.${input.pose}`);
  const model = input?.kind === "fashion" ? models.find((m) => m.id === input.model) : undefined;
  const summary = !input
    ? ""
    : input.kind === "product"
      ? input.brief || t("detail.noBrief")
      : [model?.id ? t(`fashion.models.${model.id}`, { name: model.name }) : t("detail.anyModel"), t(`fashion.backgrounds.${input.background}`)].join(" · ");

  return (
    <Page
      background={<Glow blobs={[{ x: 48, y: 32, size: 192, color: "#E9E4F5", opacity: 0.6 }, { x: 342, y: 120, size: 176, color: "#FCEEE7", opacity: 0.5 }]} />}
      header={
        <TopBar
          leading={
            <View style={{ marginLeft: -8, marginRight: 2 }}>
              <BackButton icon={ChevronLeft} />
            </View>
          }
          title={title || undefined}
          trailing={
            <View style={styles.headerRight}>
              <BrandChip />
            </View>
          }
        />
      }
      contentStyle={{ paddingTop: space[8], paddingBottom: space[24] }}
      footer={
        shoot ? (
          <>
            {error ? <Text style={[type.meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
            {story && photo ? <IconLabelButton label={t("detail.useInStory")} icon={ArrowRight} trailing onPress={() => backToStory(story, { kind: "photoshoot", id: photo.key })} /> : null}
            <View style={styles.actions}>
              <IconLabelButton label={t("detail.downloadPhoto")} icon={Download} disabled={busy !== null} onPress={() => void share()} style={{ flex: 1, paddingHorizontal: 0 }} />
              <IconLabelButton
                label={t("detail.variation")}
                icon={Sparkle}
                variant="outline"
                bold
                disabled={busy !== null}
                onPress={() => void run("variation", () => startShoot(shoot.input, title))}
              />
              <HeaderIcon icon={Share2} label={t("detail.share")} onPress={() => void share()} />
            </View>
          </>
        ) : undefined
      }
    >
      {!shoot ? (
        error ? <Text style={[type.meta, { color: color.error }]}>{error}</Text> : <PageLoading photo />
      ) : (
        <>
          <View style={[styles.card, { padding: space[8] }]}>
            <View style={[styles.photo, { aspectRatio: ASPECT[shoot.input.ratio] }]}>
              {compare ? (
                <Image source={{ uri: shoot.sourceUrl, cacheKey: shoot.input.sourceKey }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={t("detail.original")} />
              ) : photo ? (
                <Image source={{ uri: photo.url, cacheKey: photo.key }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={t("detail.photoOf", { index: shown + 1, count: shoot.shots.length })} />
              ) : null}
              <PhotoPill dot="rgba(0,0,0,0.5)" style={{ top: 12, left: 12, borderColor: "rgba(255,255,255,0.6)" }}>
                {compare ? t("detail.original") : t("detail.photoOf", { index: shown + 1, count: shoot.shots.length })}
              </PhotoPill>
              <PhotoPill muted style={{ top: 14, right: 12, backgroundColor: "rgba(255,255,255,0.8)", borderColor: "rgba(255,255,255,0.4)" }}>
                {t("detail.formatBadge", { ratio: shoot.input.ratio })}
              </PhotoPill>
              <View style={styles.photoActions}>
                <IconLabelButton
                  label={compare ? t("detail.showResult") : t("detail.compareOriginal")}
                  icon={Columns2}
                  variant="dark"
                  height={44}
                  onPress={() => setCompare((c) => !c)}
                  style={{ paddingHorizontal: space[12] }}
                />
              </View>
            </View>
            <View style={styles.strip} accessibilityRole="radiogroup" accessibilityLabel={t("detail.photos")}>
              {shoot.shots.map((s, i) => (
                <Pressable
                  key={s.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: i === shown && !compare }}
                  accessibilityLabel={t("detail.photoOf", { index: i + 1, count: shoot.shots.length })}
                  onPress={() => {
                    setShown(i);
                    setCompare(false);
                  }}
                  style={[styles.stripItem, i === shown && !compare && styles.stripOn]}
                >
                  <Image source={{ uri: s.url, cacheKey: s.key }} style={{ flex: 1 }} contentFit="cover" />
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.card, styles.section]}>
            <View style={styles.rowBetween}>
              <Text style={[type.cardTitle, { letterSpacing: -0.24 }]} accessibilityRole="header">
                {t("detail.stagingSummary")}
              </Text>
              <Badge>{style}</Badge>
            </View>
            <Text style={[type.body, { paddingTop: space[12] }]}>{summary}</Text>
          </View>

          <View style={[styles.card, styles.section]}>
            <View style={styles.rowBetween}>
              <Text style={type.meta}>{t("detail.format")}</Text>
              <Text style={[type.meta, { color: color.ink }]}>{shoot.input.ratio}</Text>
            </View>
            <View style={[styles.rowBetween, { paddingTop: space[8] }]}>
              <Text style={type.meta}>{t("tiers.label")}</Text>
              <Text style={[type.meta, { color: color.ink }]}>{t(`tiers.${shoot.tier}.name`)}</Text>
            </View>
            <View style={[styles.rowBetween, { paddingTop: space[8] }]}>
              <Text style={type.meta}>{t("detail.creationCost")}</Text>
              <Text style={[type.meta, { color: color.ink }]}>{t("detail.credits", { count: shoot.credits })}</Text>
            </View>
          </View>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: ps.border,
    borderRadius: radius.card,
    shadowColor: "#23182F",
    shadowOpacity: 0.01,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  section: { marginTop: space[24], padding: space[20] },
  photo: { borderRadius: radius.control, overflow: "hidden", backgroundColor: ps.chip },
  photoActions: { position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row", justifyContent: "flex-start", alignItems: "center" },
  strip: { flexDirection: "row", gap: space[8], paddingTop: space[8] },
  stripItem: { flex: 1, aspectRatio: 1, borderRadius: radius.nested, overflow: "hidden", backgroundColor: ps.chip, borderWidth: 2, borderColor: "transparent" },
  stripOn: { borderColor: color.primary },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8], paddingBottom: space[8] },
});
