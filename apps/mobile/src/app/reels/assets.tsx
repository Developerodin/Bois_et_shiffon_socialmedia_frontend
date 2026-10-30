import { Image } from "expo-image";
import { router } from "expo-router";
import { ImagePlus } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { brandAssets, currentBrand, uploadPhoto } from "@/api/endpoints";
import { color, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { ActionButton, BackTitle, BrandPill, PageHeader, Panel, ReelsScreen, Tag, eyebrow, meta, rc, strong14 } from "@/ui/reels/kit";
import { useReel } from "@/ui/reels/use-reel";

type Asset = { key: string; url: string; title: string };

/** R13 · Reels / Select assets. Selection order = storyboard scene order. */
export default function ReelsAssets() {
  const { t } = useTranslation("reels");
  const { id, detail, busy, error, save, setError } = useReel();
  const [site, setSite] = useState("");
  const [library, setLibrary] = useState<Asset[]>([]);
  const [uploads, setUploads] = useState<Asset[]>([]);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    currentBrand()
      .then((b) => brandAssets(b.workspaceId, b.brandId))
      .then((a) => {
        setSite(a.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") ?? "");
        setLibrary((a.assets?.products ?? []).flatMap((p) => (p.image ? [{ key: p.image.key, url: p.image.url, title: p.title }] : [])));
      }, () => {});
  }, []);
  const plan = detail?.plan;
  // Everything selectable: uploads first, then photos already in the plan, then the website's product photos.
  const inPlan: Asset[] = (plan?.scenes ?? []).map((sc) => ({ key: sc.photoKey, url: detail?.photoUrls[sc.photoKey] ?? "", title: sc.shot }));
  const assets = [...uploads, ...inPlan, ...library].filter((a, i, all) => all.findIndex((b) => b.key === a.key) === i);
  const order = chosen ?? plan?.scenes.map((sc) => sc.photoKey) ?? [];
  const setOrder = (f: (o: string[]) => string[]) => setChosen(f(order));
  const toggle = (key: string) => setOrder((o) => (o.includes(key) ? o.filter((x) => x !== key) : [...o, key]));
  const picked = order.flatMap((key) => assets.filter((a) => a.key === key));
  const upload = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 6, quality: 0.85 });
    if (r.canceled) return;
    setUploading(true);
    try {
      for (const a of r.assets) {
        const up = await uploadPhoto(a.uri, a.fileName ?? "photo.jpg", a.mimeType ?? "image/jpeg");
        setUploads((u) => [{ key: up.key, url: up.previewUrl, title: a.fileName ?? t("assets.yourPhoto") }, ...u]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };
  // The selection order becomes the scene order; the director re-plans moved scenes when the plan is saved.
  const apply = async () => {
    if (!plan || !id) return;
    if (chosen) {
      const next = { ...plan, scenes: plan.scenes.map((sc, i) => ({ ...sc, photoKey: order[i] ?? sc.photoKey })) };
      if (!(await save(next))) return;
    }
    router.push("/reels/storyboard");
  };

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("assets.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
      footer={
        <Footer>
          {error ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          {!id ? <Text style={[meta, { textAlign: "center" }]}>{t("assets.planFirst")}</Text> : null}
          <Button
            label={busy ? t("assets.saving") : t("assets.createStoryboard", { count: order.length })}
            arrow
            disabled={order.length === 0 || busy || !id}
            onPress={() => void apply()}
          />
        </Footer>
      }
    >
      <ActionButton
        label={uploading ? <ActivityIndicator color={color.ink} /> : t("assets.upload")}
        variant="outline"
        leading={ImagePlus}
        height={46}
        disabled={uploading}
        onPress={() => void upload()}
        labelStyle={{ fontFamily: "Inter_600SemiBold" }}
      />

      <View style={styles.listHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
          <Text style={eyebrow}>{t("assets.websiteAssets")}</Text>
          {site ? <Tag label={site} tone="grey" /> : null}
        </View>
        <Text style={strong14}>{t("assets.selected", { count: order.length })}</Text>
      </View>

      <View style={styles.grid}>
        {assets.map((a) => {
          const n = order.indexOf(a.key) + 1;
          const on = n > 0;
          const otherCategory = !on;
          const scene = on ? t("assets.sceneN", { n }) : t("assets.otherCategory");
          return (
            <Pressable
              key={a.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t("assets.itemA11y", { title: a.title, scene })}
              onPress={() => toggle(a.key)}
              style={[styles.card, on && styles.cardOn]}
            >
              <View style={styles.thumb}>
                <Image source={a.url ? { uri: a.url } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={[styles.badge, on ? styles.badgeOn : styles.badgeOff]}>{on ? <Text style={[meta, { color: color.onPrimary }]}>{n}</Text> : null}</View>
              </View>
              <View style={{ paddingTop: space[8], paddingHorizontal: 4 }}>
                {otherCategory && !on ? (
                  <>
                    <Text style={meta}>{a.title}</Text>
                    <Text style={meta}>{scene}</Text>
                  </>
                ) : (
                  <>
                    <Text style={[strong14, { minHeight: 40 }]}>{a.title}</Text>
                    <Text style={meta}>{scene}</Text>
                  </>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Panel style={{ marginTop: space[24], padding: space[12] }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={meta}>{t("assets.sequence")}</Text>
          <Text style={meta}>{t("assets.dragToReorder")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space[8], paddingTop: space[8] }}>
          {picked.map((a, i) => (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              accessibilityLabel={t("assets.reorderA11y", { n: i + 1, label: a.title })}
              // No drag library is installed: tapping moves the scene one place earlier.
              onPress={() => i > 0 && setOrder((o) => [...o.slice(0, i - 1), o[i], o[i - 1], ...o.slice(i + 1)])}
              style={styles.seq}
            >
              <Image source={a.url ? { uri: a.url } : undefined} style={styles.seqImg} contentFit="cover" />
              <Text style={type.label} numberOfLines={1}>{t("assets.sequenceItem", { n: i + 1, label: a.title })}</Text>
            </Pressable>
          ))}
        </View>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space[24], paddingHorizontal: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[16], paddingTop: space[24] },
  card: {
    width: "47.5%",
    flexGrow: 1,
    minHeight: 230,
    padding: space[8],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: rc.border,
    borderRadius: radius.card,
  },
  cardOn: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary, padding: 7 },
  thumb: { height: 144, borderRadius: radius.control, overflow: "hidden", backgroundColor: rc.tagGrey },
  badge: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badgeOn: { backgroundColor: color.primary },
  badgeOff: { backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#D4D4DC" },
  seq: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 6,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#E4E3E9",
    borderRadius: radius.control,
  },
  seqImg: { width: 28, height: 32, borderRadius: radius.control },
});
