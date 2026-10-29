import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight, Pencil } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { setBrandWebsite, startResearch } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { BrandLogo } from "@/ui/onboarding/brand-logo";
import { onboarding } from "@/ui/onboarding/state";
import { imageSource, saveBrandText, useBrandAssets } from "@/ui/onboarding/use-brand-assets";
import { color, radius, space, type } from "@/theme/tokens";

type TextField = "name" | "tagline" | "audience";

/** A09 · Onboarding / Review business (Figma 408:557). */
export default function Review() {
  const { t } = useTranslation("onboarding");
  const { data: brand, loading } = useBrandAssets();
  const products = brand?.assets?.products ?? [];
  const summary = brand?.summary;
  // Made without a website (A07): don't talk about "your website".
  const noSite = !!brand && !brand.website;
  const [editing, setEditing] = useState<TextField | null>(null);
  const [failed, setFailed] = useState<TextField | null>(null);

  // Saves when the field is left; an unchanged or (for the name) empty value isn't sent. Failure rolls back and says so.
  const commit = (field: TextField, value: string) => {
    setEditing(null);
    const v = value.trim();
    const current = field === "name" ? (brand?.name ?? "") : (summary?.[field] ?? "");
    if (v === current || (field === "name" && !v)) return;
    setFailed(null);
    saveBrandText(field, v).catch(() => setFailed(field));
  };
  const editable = { editing, setEditing, commit, failed, t };

  // The online lookup found a website the owner didn't give: "use it?" sets it and reads it (logo, colours, products).
  const foundSite = noSite ? summary?.foundWebsite : null;
  const [siteDismissed, setSiteDismissed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [siteFailed, setSiteFailed] = useState(false);
  const acceptFoundSite = async (site: string) => {
    const { workspaceId: ws, brandId } = onboarding;
    if (!ws || !brandId) return;
    setSwitching(true);
    setSiteFailed(false);
    try {
      await setBrandWebsite(ws, brandId, site);
      const { run } = await startResearch(ws, brandId);
      // Same brand, now made from this site: Learning follows the new run instead of creating a brand.
      Object.assign(onboarding, { researchRunId: run.id, brandFrom: site });
      router.replace({ pathname: "/onboarding/learning", params: { site } });
    } catch {
      setSiteFailed(true);
      setSwitching(false);
    }
  };

  return (
    <Screen header={<StepHeader step={3} />} footer={<Button label={t("common:continue")} arrow onPress={() => router.push("/onboarding/brand")} />}>
      <Title title={t("review.title")} subtitle={t(noSite ? "review.subtitleNoWebsite" : "review.subtitle")} style={{ paddingBottom: space[8] }} />

      <View style={[styles.card, styles.identity]}>
        <View style={styles.logo}>
          <BrandLogo brand={brand} size={32} />
        </View>
        <View style={{ flex: 1 }}>
          <Editable {...editable} field="name" value={brand?.name ?? ""} label={t("review.name")} style={[type.cardTitle, { letterSpacing: -0.24 }]} />
          <Text style={[type.meta, { paddingTop: 2 }]} numberOfLines={1}>{brand?.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") ?? ""}</Text>
        </View>
        {editing !== "name" ? <Button label={t("review.edit")} variant="ghost" height={44} accessibilityLabel={t("review.editName")} onPress={() => setEditing("name")} /> : null}
      </View>

      {foundSite && !siteDismissed ? (
        <Section label={t("review.foundSite")}>
          <Text style={[type.body, { paddingTop: space[4] }]}>{t("review.foundSiteBody", { host: foundSite.replace(/^https?:\/\/(www\.)?/, "") })}</Text>
          {siteFailed ? (
            <Text accessibilityLiveRegion="polite" style={[type.meta, { color: color.error, paddingTop: space[4] }]}>
              {t("review.useSiteFailed")}
            </Text>
          ) : null}
          <View style={styles.siteActions}>
            <Button label={t("review.notMine")} variant="ghost" height={44} disabled={switching} onPress={() => setSiteDismissed(true)} />
            <Button label={t("review.useSite")} height={44} loading={switching} onPress={() => void acceptFoundSite(foundSite)} />
          </View>
        </Section>
      ) : null}

      <Section label={t("review.tagline")}>
        <View style={styles.inlineRow}>
          <View style={{ flex: 1 }}>
            <Editable {...editable} field="tagline" value={summary?.tagline ?? ""} label={t("review.tagline")} placeholder={t("review.addTagline")} style={[styles.inlineInput, { paddingVertical: 12 }]} />
          </View>
          <EditButton label={t("review.editTagline")} onPress={() => setEditing("tagline")} />
        </View>
      </Section>

      {summary?.tags.length ? (
        <Section label={t("review.categoryLocation")}>
          <View style={styles.tags}>
            {summary.tags.map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>
        </Section>
      ) : null}

      <Section label={t("review.audience")} action={<EditButton label={t("review.editAudience")} onPress={() => setEditing("audience")} />}>
        <Editable {...editable} field="audience" multiline value={summary?.audience ?? ""} label={t("review.audience")} placeholder={t("review.addAudience")} style={[type.body, { paddingTop: space[4] }]} />
      </Section>

      <Section label={t("review.products", { count: products.length })} action={products.length ? <Text style={type.meta}>{t("review.found")}</Text> : undefined}>
        {loading ? (
          <ActivityIndicator color={color.inkSecondary} style={{ paddingTop: space[12] }} />
        ) : products.length === 0 ? (
          <Text style={[type.body, { paddingTop: space[4], color: color.inkSecondary }]}>{t(noSite ? "review.noProductsNoWebsite" : "review.noProducts")}</Text>
        ) : (
          <View style={{ gap: space[12], paddingTop: space[12] }}>
            {products.slice(0, 4).map((prod) => (
              <View key={`${prod.url}#${prod.title}`} style={styles.product}>
                {prod.image ? <Image source={imageSource(prod.image)} style={styles.productImage} contentFit="cover" /> : <View style={styles.productImage} />}
                <View style={{ flex: 1 }}>
                  <Text style={[type.meta, { color: color.ink }]} numberOfLines={2}>
                    {prod.title}
                  </Text>
                  {prod.kind ? <Text style={[type.meta, { paddingTop: 5 }]}>{prod.kind}</Text> : null}
                </View>
                <ChevronRight size={20} color={color.inkSecondary} strokeWidth={1.75} />
              </View>
            ))}
          </View>
        )}
      </Section>

      {summary?.strengths ? (
        <Section label={t("review.strengths")}>
          <Text style={[type.body, { paddingTop: space[4] }]}>{summary.strengths}</Text>
        </Section>
      ) : null}
    </Screen>
  );
}

type EditableProps = {
  field: TextField;
  value: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  style: StyleProp<TextStyle>;
  editing: TextField | null;
  setEditing: (f: TextField | null) => void;
  commit: (f: TextField, v: string) => void;
  failed: TextField | null;
  t: TFunction<"onboarding">;
};

/** Text that becomes a field in place; leaving the field saves it. A failed save is said in words under it. */
function Editable({ field, value, label, placeholder, multiline, style, editing, setEditing, commit, failed, t }: EditableProps) {
  return (
    <>
      {editing === field ? (
        <Field field={field} value={value} label={label} placeholder={placeholder} multiline={multiline} style={style} commit={commit} />
      ) : (
        <Text style={[style, !value && { color: color.inkSecondary }]} onPress={() => setEditing(field)}>
          {value || placeholder}
        </Text>
      )}
      {failed === field ? (
        <Text accessibilityLiveRegion="polite" style={[type.meta, { color: color.error, paddingTop: space[4] }]}>
          {t("review.saveFailed")}
        </Text>
      ) : null}
    </>
  );
}

/** Mounts each time editing starts (text tap, pencil or "Edit"), so the draft always begins from the current value. */
function Field({ field, value, label, placeholder, multiline, style, commit }: Pick<EditableProps, "field" | "value" | "label" | "placeholder" | "multiline" | "style" | "commit">) {
  const [draft, setDraft] = useState(value);
  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      autoFocus
      multiline={multiline}
      maxLength={field === "tagline" ? 120 : field === "name" ? 80 : 240}
      onBlur={() => commit(field, draft)}
      onSubmitEditing={multiline ? undefined : () => commit(field, draft)}
      placeholder={placeholder}
      style={[style, multiline && styles.areaInput]}
      accessibilityLabel={label}
    />
  );
}

function Section({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={[styles.card, { marginTop: space[24], padding: space[16] }]}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function EditButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.edit} hitSlop={4}>
      <Pencil size={18} color={color.inkSecondary} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.7)",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  identity: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[16], borderRadius: radius.card, marginTop: space[16] },
  logo: { minWidth: 40, height: 40, padding: space[4], borderRadius: radius.badge, backgroundColor: "#EEEDF7", alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 18 },
  sectionLabel: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 },
  inlineRow: { flexDirection: "row", alignItems: "center", paddingTop: space[4] },
  inlineInput: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 16, lineHeight: 24, color: color.ink, minHeight: 48 },
  areaInput: { marginTop: space[8], padding: space[12], borderWidth: 1, borderColor: color.controlOutline, borderRadius: radius.control, minHeight: 72, textAlignVertical: "top" },
  edit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  siteActions: { flexDirection: "row", justifyContent: "flex-end", gap: space[8], paddingTop: space[12] },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[8] },
  tag: { ...type.meta, color: color.ink, paddingVertical: space[4], paddingHorizontal: space[12], backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: "rgba(232,231,237,0.8)", borderRadius: radius.badge, overflow: "hidden" },
  product: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[8], backgroundColor: "#FBF8FF", borderWidth: 1, borderColor: "rgba(232,231,237,0.6)", borderRadius: radius.control },
  productImage: { width: 56, height: 56, borderRadius: radius.control, backgroundColor: color.surface },
});
