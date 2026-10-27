import { useState } from "react";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Check, Plus, Sparkles, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { BackButton, ps, STROKE, TopBar } from "@/ui/photoshoot/chrome";
import { FilterChips, Page, Segmented } from "@/ui/photoshoot/controls";
import { business, say, sourceAssets, sourceFilters, type Group, type SourceAsset } from "@/ui/photoshoot/sample";
import { color, font, radius, space, type } from "@/theme/tokens";

type Tab = "website" | "uploads";

/**
 * F04 · Photoshoot / Source picker. Opened from product setup ("Change asset") or fashion setup
 * (`?for=fashion`); "Use photo" hands the chosen id back to whichever screen opened it.
 */
export default function SourcePicker() {
  const { t } = useTranslation("photoshoot");
  const { for: target } = useLocalSearchParams<{ for?: string }>();
  const [tab, setTab] = useState<Tab>("website");
  const [filter, setFilter] = useState<"all" | Group>("all");
  const [selected, setSelected] = useState<string>(sourceAssets[0].id);

  const items = tab === "uploads" ? [] : sourceAssets.filter((a) => filter === "all" || a.groups.includes(filter));
  const chosen = sourceAssets.find((a) => a.id === selected);
  const use = () => {
    if (!chosen) return;
    if (target === "fashion") router.dismissTo({ pathname: "/photoshoot/fashion", params: { garment: chosen.id } });
    else router.dismissTo({ pathname: "/photoshoot/product", params: { asset: chosen.id } });
  };

  // Rows of three so every tile keeps the same width; the "Add photo" tile closes the grid.
  const tiles: (SourceAsset | "add")[] = [...items, "add"];
  const rows: (SourceAsset | "add")[][] = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));

  return (
    <Page
      header={
        <TopBar
          leading={<BackButton label={t("close", { ns: "common" })} icon={X} />}
          title={t("source.title")}
          trailing={
            <Pressable accessibilityRole="button" accessibilityLabel={t("source.uploadNewLabel")} style={styles.textButton}>
              <Text style={type.label}>{t("source.uploadNew")}</Text>
            </Pressable>
          }
        />
      }
      contentStyle={{ paddingTop: space[12] }}
      footer={
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footerTitle} numberOfLines={1}>
              {chosen?.product ?? t("source.noPhotoSelected")}
            </Text>
            <Text style={type.meta}>{chosen ? t("source.photosSelected", { count: 1 }) : t("source.selectPhoto")}</Text>
          </View>
          <Button label={t("source.usePhoto")} arrow disabled={!chosen} onPress={use} style={{ paddingHorizontal: space[24] }} />
        </View>
      }
    >
      <Segmented<Tab>
        label={t("source.source")}
        boldSelected={false}
        options={[
          { value: "website", label: t("source.tabs.website"), count: sourceAssets.length },
          { value: "uploads", label: t("source.tabs.uploads"), count: 0 },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={styles.sourceRow}>
        <View style={styles.sourceName}>
          <Image source={business.favicon} style={{ width: 16, height: 16 }} contentFit="contain" />
          <Text style={[type.meta, { color: color.ink }]}>{t("source.businessWebsite", { name: business.name })}</Text>
        </View>
        <View style={styles.fromBadge}>
          <Text style={type.meta}>{t("source.fromWebsite")}</Text>
        </View>
      </View>

      <FilterChips label={t("source.filterCatalog")} options={sourceFilters.map((f) => ({ value: f.value, label: say(t, f.label) }))} value={filter} onChange={setFilter} />

      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((tile) =>
              tile === "add" ? (
                <Pressable key="add" accessibilityRole="button" accessibilityLabel={t("source.addPhoto")} style={[styles.tile, styles.addTile]}>
                  <View style={styles.addIcon}>
                    <Plus size={16} color={color.ink} strokeWidth={STROKE} />
                  </View>
                  <Text style={type.label}>{t("source.addPhoto")}</Text>
                </Pressable>
              ) : (
                <AssetTile key={tile.id} asset={tile} selected={tile.id === selected} onPress={() => setSelected(tile.id)} />
              ),
            )}
            {Array.from({ length: 3 - row.length }, (_, i) => (
              <View key={`pad${i}`} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.tip}>
        <View style={styles.tipIcon}>
          <Sparkles size={16} color={color.inkSecondary} strokeWidth={STROKE} />
        </View>
        <Text style={[type.body, { color: color.inkSecondary, flex: 1 }]}>
          {t("source.tip")}
        </Text>
      </View>
    </Page>
  );
}

function AssetTile({ asset, selected, onPress }: { asset: SourceAsset; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={asset.label}
      onPress={onPress}
      style={[styles.tile, selected ? styles.tileOn : styles.tileOff]}
    >
      <Image source={asset.image} style={styles.tileImage} contentFit="cover" />
      {selected ? (
        <View style={styles.check}>
          <Check size={14} color={color.onPrimary} strokeWidth={2.5} />
        </View>
      ) : null}
      <View style={[styles.tileLabel, selected && { backgroundColor: "rgba(255,255,255,0.9)" }]}>
        <Text style={[type.meta, selected && { color: color.ink }]} numberOfLines={1}>
          {asset.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  textButton: { minHeight: 44, minWidth: 44, justifyContent: "center", borderRadius: radius.control },
  sourceRow: {
    marginTop: space[16],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[12],
    paddingHorizontal: space[16],
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.7)",
    borderRadius: radius.control,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  sourceName: { flexDirection: "row", alignItems: "center", gap: space[12], flexShrink: 1 },
  fromBadge: { paddingVertical: 2, paddingHorizontal: space[8], backgroundColor: "#F4F2FD", borderWidth: 1, borderColor: "rgba(226,225,235,0.5)", borderRadius: radius.badge },
  grid: { paddingTop: space[20], gap: 12 },
  gridRow: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, aspectRatio: 1, borderRadius: radius.control },
  tileOff: { backgroundColor: color.surface, borderWidth: 1, borderColor: ps.hairline, padding: 7 },
  // Figma draws the selection as two spread shadows: an indigo ring outside a canvas-coloured gap.
  tileOn: { backgroundColor: "#EFEDFB", padding: space[8], outlineColor: color.primary, outlineWidth: 2, outlineOffset: 2, outlineStyle: "solid" },
  tileImage: { flex: 1 },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { position: "absolute", left: 6, right: 6, bottom: 4, paddingVertical: 2, paddingHorizontal: space[4], borderRadius: 4, backgroundColor: "rgba(255,255,255,0.8)" },
  addTile: { alignItems: "center", justifyContent: "center", gap: space[8], backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlOutline },
  addIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#EAE8F0", alignItems: "center", justifyContent: "center" },
  tip: {
    marginTop: space[16],
    flexDirection: "row",
    gap: space[12],
    padding: space[20],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: ps.border,
    borderRadius: radius.card,
  },
  tipIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#EAE8F0", alignItems: "center", justifyContent: "center", marginTop: 2 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[12] },
  footerTitle: { ...type.label, fontFamily: font.semibold },
});
