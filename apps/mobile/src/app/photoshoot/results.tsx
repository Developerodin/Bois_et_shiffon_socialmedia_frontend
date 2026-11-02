import { useCallback, useState } from "react";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { Images, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { photoshoots, type Shoot } from "@/api/endpoints";
import { BottomNav, BusinessSwitch, Glow, ModuleHeader, ps, STROKE } from "@/ui/photoshoot/chrome";
import { Badge, FilterChips, IconLabelButton, Page } from "@/ui/photoshoot/controls";
import { shootMeta, shootTitle } from "@/ui/photoshoot/describe";
import { color, font, radius, space, type } from "@/theme/tokens";

type Filter = "all" | Shoot["kind"];
const POLL_MS = 10_000;

/** F06 · Photoshoot / Results: this business's shoots, newest first; read again every POLL_MS while one is running. */
export default function Results() {
  const { t } = useTranslation("photoshoot");
  const [filter, setFilter] = useState<Filter>("all");
  const [shoots, setShoots] = useState<Shoot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const ctrl = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const load = () =>
        photoshoots.list(ctrl.signal).then(
          (r) => {
            setShoots(r.shoots);
            setError(null);
            if (r.shoots.some((s) => s.status === "RUNNING")) timer = setTimeout(load, POLL_MS);
          },
          (e: unknown) => {
            if (ctrl.signal.aborted) return;
            setError(e instanceof Error ? e.message : String(e));
            timer = setTimeout(load, POLL_MS);
          },
        );
      void load();
      return () => {
        ctrl.abort();
        clearTimeout(timer);
      };
    }, []),
  );
  const all = shoots ?? [];
  const count = (k: Filter) => all.filter((s) => k === "all" || s.kind === k).length;
  const list = all.filter((s) => filter === "all" || s.kind === filter);

  return (
    <Page
      background={
        <Glow
          blobs={[
            { x: 40, y: 330, size: 256, color: "#EAE8F8", opacity: 0.6 },
            { x: 360, y: 420, size: 224, color: "#FCEEE8", opacity: 0.5 },
            { x: 330, y: 760, size: 192, color: "#E5EEF8", opacity: 0.5 },
          ]}
        />
      }
      header={<ModuleHeader />}
      bottom={<BottomNav active="results" />}
      contentStyle={{ paddingTop: 28 }}
    >
      <BusinessSwitch chevron={16} />
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.pageTitle} accessibilityRole="header">
            {t("results.title")}
          </Text>
          <Text style={[type.meta, { paddingTop: 2, maxWidth: 178 }]}>{t("results.subtitle")}</Text>
        </View>
        <IconLabelButton label={t("results.newPhotoshoot")} icon={Plus} onPress={() => router.navigate("/photoshoot")} />
      </View>

      <FilterChips<Filter>
        label={t("results.filterLabel")}
        options={[
          { value: "all", label: t("results.filters.all", { count: count("all") }) },
          { value: "product", label: t("results.filters.product", { count: count("product") }) },
          { value: "fashion", label: t("results.filters.fashion", { count: count("fashion") }) },
        ]}
        value={filter}
        onChange={setFilter}
      />

      <View style={styles.list}>
        {error ? <Text style={[type.meta, { color: color.error }]}>{error}</Text> : null}
        {shoots === null && !error ? <ActivityIndicator color={color.ink} style={{ paddingVertical: space[24] }} /> : null}
        {shoots && list.length === 0 ? <Text style={[type.body, { color: color.inkSecondary, textAlign: "center", paddingVertical: space[24] }]}>{t("results.empty")}</Text> : null}
        {list.map((s) => (s.status === "DONE" ? <PreviewCard key={s.id} shoot={s} /> : <PendingCard key={s.id} shoot={s} />))}
      </View>
    </Page>
  );
}

/** Running (opens F05) or failed (credits refunded). */
function PendingCard({ shoot }: { shoot: Shoot }) {
  const { t } = useTranslation("photoshoot");
  const title = shootTitle(t, shoot);
  const failed = shoot.status === "FAILED";
  const badge = failed ? t("results.failedBadge") : t("results.processingBadge", { count: shoot.credits });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${badge}`}
      onPress={() => router.push({ pathname: "/photoshoot/generating", params: { id: shoot.id } })}
      style={({ pressed }) => [styles.article, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.thumb, styles.pending]}>
        <View style={styles.pendingRing} />
        <Images size={20} color={ps.navIdle} strokeWidth={STROKE} />
      </View>
      <View style={styles.body}>
        <Badge dot={!failed}>{badge}</Badge>
        <Text style={styles.title}>{title}</Text>
        <Text style={[type.meta, { paddingTop: 2 }]} numberOfLines={2}>
          {failed ? t("results.refunded", { count: shoot.credits }) : shootMeta(t, shoot).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

function PreviewCard({ shoot }: { shoot: Shoot }) {
  const { t } = useTranslation("photoshoot");
  const title = shootTitle(t, shoot);
  const cover = shoot.shots[0];
  return (
    <View style={[styles.article, { minHeight: 154 }]}>
      <View style={[styles.thumb, styles.photoThumb]}>
        {cover ? <Image source={{ uri: cover.url, cacheKey: cover.key }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel={title} /> : null}
      </View>
      <View style={styles.body}>
        <Badge tone="outline">{t("results.ready")}</Badge>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[type.meta, { paddingTop: 2 }]}>{shootMeta(t, shoot).join(" · ")}</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t("results.reviewPhotoLabel", { title })}
          onPress={() => router.push({ pathname: "/photoshoot/[id]", params: { id: shoot.id } })}
          style={styles.link}
        >
          <Text style={[type.meta, { color: color.ink }]}>{t("results.reviewPhoto")}</Text>
          <Text style={[type.meta, { color: color.ink }]}>→</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", paddingTop: space[12] },
  list: { gap: space[16], paddingTop: space[16] },
  article: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[16],
    padding: space[16],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: ps.border,
    borderRadius: radius.card,
    shadowColor: "#23182F",
    shadowOpacity: 0.01,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  thumb: { width: 84, height: 84, borderRadius: radius.control, overflow: "hidden" },
  pending: { backgroundColor: ps.chip, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  pendingRing: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "rgba(16,16,20,0.15)", opacity: 0.6 },
  photoThumb: { backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: "rgba(232,231,237,0.5)", padding: space[4] },
  body: { flex: 1, paddingRight: space[4] },
  title: { ...type.label, fontFamily: font.semibold, paddingTop: space[4] },
  link: { alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", gap: space[4], marginTop: space[8] },
});
