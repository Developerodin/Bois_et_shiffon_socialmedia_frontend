import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { ExternalLink, Package } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { catalog, type FullProduct, type ProductFacts } from "@/api/endpoints";
import { color, radius, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, SettingsCard, bc, body12, strong14 } from "@/ui/business/kit";
import { ago, priceLabel, stockLabel, thumbUrl } from "@/ui/business/products";
import { Field } from "@/ui/field";
import { ActionButton, ICON, bodyMuted, meta } from "@/ui/reels/kit";
import { useCurrentBrand } from "@/ui/use-current-brand";
import { usePermissions } from "@/ui/use-permissions";

const FACTS = ["materials", "dimensions", "certifications"] as const;
const blank = (s: string) => (s.trim() ? s.trim() : null);

/**
 * Business / Products / one product: what the store says (price, stock and when it was checked, SKU, link,
 * description) and the facts people add (materials, dimensions, certifications), which every sync leaves alone.
 */
export default function ProductDetail() {
  const { t } = useTranslation("business");
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useCurrentBrand();
  const ws = brand?.workspaceId;
  const brandId = brand?.id;
  // Facts decide whether the quality check accepts a product claim: only rules.approve holders may change them.
  const canVouch = usePermissions().can("rules.approve");
  const [product, setProduct] = useState<FullProduct | null>(null);
  const [facts, setFacts] = useState<Record<(typeof FACTS)[number], string>>({ materials: "", dimensions: "", certifications: "" });
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  // The product with its description (the list leaves descriptions out). 404: it's gone from the catalogue.
  useEffect(() => {
    if (!ws || !brandId) return;
    const ctrl = new AbortController();
    catalog.get(ws, brandId, id, ctrl.signal).then(
      (r) => setProduct(r.product),
      (e: unknown) => !ctrl.signal.aborted && setError(e instanceof ApiError && e.status === 404 ? t("products.notFound") : e instanceof Error ? e.message : String(e)),
    );
    return () => ctrl.abort();
  }, [ws, brandId, id, t]);

  // The form starts from the product once it's known, and again if another product opens here (not on each save).
  const [formFor, setFormFor] = useState<string | null>(null);
  if (product && formFor !== product.id) {
    setFormFor(product.id);
    setFacts({ materials: product.materials ?? "", dimensions: product.dimensions ?? "", certifications: product.certifications ?? "" });
  }

  const changed = !!product && FACTS.some((k) => blank(facts[k]) !== product[k]);
  const save = async () => {
    if (!product || !ws || !brandId) return;
    setState("saving");
    setError(null);
    try {
      const body = Object.fromEntries(FACTS.map((k) => [k, blank(facts[k])])) as ProductFacts;
      const { product: saved } = await catalog.update(ws, brandId, product.id, body);
      setProduct(saved);
      setState("saved");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stock = product ? stockLabel(product, t) : null;
  const price = product ? priceLabel(product) : null;

  return (
    <BizScreen top={space[12]} header={<BrandHeader title={t("products.detailTitle")} fallback="/business/products" />}>
      {!product ? (
        error ? <Text style={[meta, { color: color.error }]}>{error}</Text> : <ActivityIndicator color={color.primary} style={{ marginTop: space[24] }} />
      ) : (
        <>
          <SettingsCard style={{ flexDirection: "row", gap: space[12] }}>
            <View style={styles.thumb}>
              {product.imageUrl ? (
                <Image source={{ uri: thumbUrl(product.imageUrl, 264) }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={product.title} />
              ) : (
                <Package size={28} color={color.inkMuted} strokeWidth={ICON.strokeWidth} />
              )}
            </View>
            <View style={{ flex: 1, gap: space[4] }}>
              <Text style={strong14}>{product.title}</Text>
              {price ? <Text style={body12}>{price}</Text> : null}
              {stock ? (
                <Text style={meta}>
                  {stock.label}
                  {product.stockCheckedAt ? ` · ${t("products.checked", { ago: ago(product.stockCheckedAt, t) })}` : ""}
                </Text>
              ) : null}
            </View>
          </SettingsCard>

          <SettingsCard style={{ marginTop: space[12], gap: space[8] }}>
            <Info label={t("products.fields.sku")} value={product.sku} />
            <Info label={t("products.fields.category")} value={product.category} />
            <Info label={t("products.fields.source")} value={t(`products.sourceShort.${product.source}`)} />
            {product.url ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(product.url!)} style={styles.link} hitSlop={8}>
                <Text style={[body12, { color: color.primary }]}>{t("products.openPage")}</Text>
                <ExternalLink size={14} color={color.primary} strokeWidth={ICON.strokeWidth} />
              </Pressable>
            ) : null}
            {product.description ? (
              <Text style={[bodyMuted, { paddingTop: space[4] }]} numberOfLines={8}>
                {product.description}
              </Text>
            ) : null}
          </SettingsCard>

          <Text style={[strong14, { paddingTop: space[20] }]}>{t("products.factsTitle")}</Text>
          <Text style={[meta, { paddingTop: space[4], paddingBottom: space[12] }]}>{t(canVouch ? "products.factsHint" : "products.factsLocked")}</Text>
          <View style={{ gap: space[12] }}>
            {FACTS.map((k) => (
              <Field
                key={k}
                label={t(`products.fields.${k}`)}
                value={facts[k]}
                onChangeText={(v) => {
                  setFacts((f) => ({ ...f, [k]: v }));
                  setState("idle");
                }}
                placeholder={t(`products.placeholders.${k}`)}
                maxLength={1000}
                editable={canVouch}
                multiline
              />
            ))}
          </View>
          {error ? <Text style={[meta, { color: color.error, paddingTop: space[12] }]}>{error}</Text> : null}
          <ActionButton
            label={state === "saving" ? t("products.saving") : state === "saved" && !changed ? t("products.saved") : t("products.save")}
            disabled={!canVouch || !changed || state === "saving"}
            style={{ marginTop: space[16] }}
            onPress={() => void save()}
          />
        </>
      )}
    </BizScreen>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.info}>
      <Text style={meta}>{label}</Text>
      <Text style={[body12, { flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 88, height: 88, borderRadius: radius.control, overflow: "hidden", backgroundColor: bc.tile, alignItems: "center", justifyContent: "center" },
  info: { flexDirection: "row", justifyContent: "space-between", gap: space[12] },
  link: { flexDirection: "row", alignItems: "center", gap: space[4], minHeight: 32 },
});
