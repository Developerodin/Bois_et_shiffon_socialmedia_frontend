import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight, Package, RefreshCw, Search } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { catalog, type CatalogStatus, type Product } from "@/api/endpoints";
import { formatNumber } from "@/i18n";
import { color, radius, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, SettingsCard, bc, body12, strong14 } from "@/ui/business/kit";
import { ago, priceLabel, stockLabel, type StockTone, thumbUrl } from "@/ui/business/products";
import { Field } from "@/ui/field";
import { ActionButton, ICON, bodyMuted, meta } from "@/ui/reels/kit";
import { useCurrentBrand } from "@/ui/use-current-brand";

const PAGE = 40;
const POLL_MS = 5000;
// A sync of a few thousand products takes well under a minute; stop waiting after three.
const POLL_TRIES = 36;

type List = CatalogStatus & { products: Product[] };

/**
 * Business / Products: the catalogue the agents work from (brief: SKU, price, stock and its freshness, materials,
 * dimensions). Synced from Shopify or the website's product feed; materials, dimensions and certifications are
 * filled in per product (detail screen). Adding products by hand is on the web Products page.
 * ponytail: the whole list in one response, searched and shown 40 at a time here; page it on the server when
 * catalogues pass a few thousand variants.
 */
export default function Products() {
  const { t } = useTranslation("business");
  const brand = useCurrentBrand();
  const ws = brand?.workspaceId;
  const brandId = brand?.id;
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [syncing, setSyncing] = useState(false);
  const poll = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(poll.current), []);

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!ws || !brandId) return;
      catalog.list(ws, brandId, signal).then(
        (r) => {
          setList(r);
          setError(null);
        },
        (e: unknown) => !signal?.aborted && setError(e instanceof Error ? e.message : String(e)),
      );
    },
    [ws, brandId],
  );

  // Once per business (not on every focus): the list can be thousands of rows. "Sync now" reads it again.
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // "Sync now" queues a sync (or finds the running one); the light status is polled while it's queued or running,
  // then the list is read once.
  const syncNow = async () => {
    if (!ws || !brandId) return;
    setSyncing(true);
    setError(null);
    try {
      await catalog.sync(ws, brandId);
    } catch (e) {
      setSyncing(false);
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    let tries = 0;
    const done = () => {
      setSyncing(false);
      load();
    };
    const next = () => {
      poll.current = setTimeout(() => {
        catalog.status(ws, brandId).then(
          (s) => (!s.running || ++tries >= POLL_TRIES ? done() : next()),
          () => (++tries >= POLL_TRIES ? done() : next()),
        );
      }, POLL_MS);
    };
    next();
  };

  const q = query.trim().toLowerCase();
  const matches = (list?.products ?? []).filter((p) => !q || p.title.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  const sync = list?.catalogSync;

  return (
    <BizScreen
      top={space[12]}
      header={
        <BrandHeader
          title={t("products.title")}
          right={
            <ActionButton
              label={syncing ? t("products.syncing") : t("products.syncNow")}
              variant="outline"
              leading={RefreshCw}
              height={44}
              disabled={syncing || !list}
              style={{ borderRadius: radius.control }}
              onPress={() => void syncNow()}
            />
          }
        />
      }
    >
      <SettingsCard style={{ borderColor: color.divider }}>
        <Text style={strong14}>{t(`products.source.${list?.source ?? "none"}`)}</Text>
        <Text style={[bodyMuted, { paddingTop: space[4] }]}>
          {syncing
            ? t("products.syncRunning")
            : sync?.error
              ? t(`products.reason.${sync.reason ?? "failed"}`)
              : sync
                ? t("products.lastSync", { count: sync.count, n: formatNumber(sync.count), ago: ago(sync.at, t) })
                : t("products.neverSynced")}
        </Text>
      </SettingsCard>

      {error ? <Text style={[meta, { color: color.error, paddingTop: space[12] }]}>{error}</Text> : null}

      {!list ? (
        error ? null : <ActivityIndicator color={color.primary} style={{ marginTop: space[24] }} />
      ) : list.products.length === 0 ? (
        <SettingsCard style={{ alignItems: "center", paddingVertical: space[32], marginTop: space[16] }}>
          <Package size={28} color={color.inkMuted} strokeWidth={ICON.strokeWidth} />
          <Text style={[strong14, { paddingTop: space[8] }]}>{t("products.emptyTitle")}</Text>
          <Text style={[meta, { textAlign: "center", paddingTop: space[4] }]}>{t("products.emptyBody")}</Text>
        </SettingsCard>
      ) : (
        <>
          <View style={{ marginTop: space[16] }}>
            <Field
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setLimit(PAGE);
              }}
              placeholder={t("products.search")}
              accessibilityLabel={t("products.search")}
              leading={<Search size={18} color={color.inkMuted} strokeWidth={ICON.strokeWidth} />}
              autoCorrect={false}
            />
          </View>
          <Text style={[meta, { paddingTop: space[12], paddingBottom: space[8] }]}>{t("products.count", { count: matches.length, n: formatNumber(matches.length) })}</Text>
          <SettingsCard style={{ paddingVertical: 0, paddingHorizontal: 0 }}>
            {matches.slice(0, limit).map((p, i) => (
              <Row key={p.id} p={p} first={i === 0} />
            ))}
          </SettingsCard>
          {matches.length > limit ? (
            <ActionButton label={t("products.showMore")} variant="outline" style={{ marginTop: space[16] }} onPress={() => setLimit((n) => n + PAGE)} />
          ) : null}
        </>
      )}
    </BizScreen>
  );
}

const TONE: Record<StockTone, { bg: string; ink: string }> = {
  in: { bg: color.successSoft, ink: color.success },
  out: { bg: color.errorSoft, ink: color.error },
  unknown: { bg: color.disabledBg, ink: color.inkSecondary },
};

function Row({ p, first }: { p: Product; first: boolean }) {
  const { t } = useTranslation("business");
  const stock = stockLabel(p, t);
  const price = priceLabel(p);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[p.title, price, stock.label].filter(Boolean).join(", ")}
      onPress={() => router.push({ pathname: "/business/product/[id]", params: { id: p.id } })}
      style={({ pressed }) => [styles.row, !first && styles.rule, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.thumb}>{p.imageUrl ? <Image source={{ uri: thumbUrl(p.imageUrl, 168) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Package size={20} color={color.inkMuted} strokeWidth={ICON.strokeWidth} />}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={strong14} numberOfLines={2}>
          {p.title}
        </Text>
        <Text style={meta} numberOfLines={1}>
          {[p.sku, price].filter(Boolean).join(" · ") || t("products.noPrice")}
        </Text>
        <View style={[styles.pill, { backgroundColor: TONE[stock.tone].bg }]}>
          <Text style={[body12, { color: TONE[stock.tone].ink }]}>{stock.label}</Text>
        </View>
      </View>
      <ChevronRight size={18} color={color.inkMuted} strokeWidth={ICON.strokeWidth} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[12], paddingHorizontal: space[12], paddingVertical: space[12], minHeight: 72 },
  rule: { borderTopWidth: 1, borderTopColor: color.divider },
  thumb: { width: 56, height: 56, borderRadius: radius.control, overflow: "hidden", backgroundColor: bc.tile, alignItems: "center", justifyContent: "center" },
  pill: { alignSelf: "flex-start", marginTop: 2, paddingHorizontal: space[8], paddingVertical: 2, borderRadius: radius.badge },
});
