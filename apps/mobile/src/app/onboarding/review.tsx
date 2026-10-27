import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight, Pencil } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/ui/button";
import { images } from "@/ui/icons";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { sampleProfile } from "@/ui/onboarding/profile";
import { color, radius, space, type } from "@/theme/tokens";

/** A09 · Onboarding / Review business (Figma 408:557). */
export default function Review() {
  const { t } = useTranslation("onboarding");
  const p = sampleProfile;
  const [tagline, setTagline] = useState(p.tagline);
  const [audience, setAudience] = useState(p.audience);
  const [editing, setEditing] = useState<"tagline" | "audience" | null>(null);

  return (
    <Screen header={<StepHeader step={3} />} footer={<Button label={t("common:continue")} arrow onPress={() => router.push("/onboarding/brand")} />}>
      <Title title={t("review.title")} subtitle={t("review.subtitle")} style={{ paddingBottom: space[8] }} />

      <View style={[styles.card, styles.identity]}>
        <View style={styles.logo}>
          <Image source={images.bcFavicon} style={{ width: 32, height: 32 }} contentFit="contain" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.cardTitle, { letterSpacing: -0.24 }]}>{p.name}</Text>
          <Text style={[type.meta, { paddingTop: 2 }]}>{p.host}</Text>
        </View>
        <Button label={t("review.edit")} variant="ghost" height={44} onPress={() => setEditing("tagline")} />
      </View>

      <Section label={t("review.tagline")}>
        <View style={styles.inlineRow}>
          {editing === "tagline" ? (
            <TextInput value={tagline} onChangeText={setTagline} autoFocus onBlur={() => setEditing(null)} style={styles.inlineInput} accessibilityLabel={t("review.tagline")} />
          ) : (
            <Text style={[styles.inlineInput, { paddingVertical: 12 }]}>{tagline}</Text>
          )}
          <EditButton label={t("review.editTagline")} onPress={() => setEditing("tagline")} />
        </View>
      </Section>

      <Section label={t("review.categoryLocation")}>
        <View style={styles.tags}>
          {p.tags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              {t(`review.tags.${tag}`)}
            </Text>
          ))}
        </View>
      </Section>

      <Section label={t("review.audience")} action={<EditButton label={t("review.editAudience")} onPress={() => setEditing("audience")} />}>
        {editing === "audience" ? (
          <TextInput value={audience} onChangeText={setAudience} autoFocus multiline onBlur={() => setEditing(null)} style={[type.body, styles.areaInput]} accessibilityLabel={t("review.audience")} />
        ) : (
          <Text style={[type.body, { paddingTop: space[4] }]}>{audience}</Text>
        )}
      </Section>

      <Section label={t("review.products", { count: p.products.length })} action={<Text style={type.meta}>{t("review.found")}</Text>}>
        <View style={{ gap: space[12], paddingTop: space[12] }}>
          {p.products.map((prod) => (
            <View key={prod.title} style={styles.product}>
              <Image source={prod.image} style={styles.productImage} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={[type.meta, { color: color.ink }]} numberOfLines={2}>
                  {prod.title}
                </Text>
                <Text style={[type.meta, { paddingTop: 5 }]}>{prod.material}</Text>
              </View>
              <ChevronRight size={20} color={color.inkSecondary} strokeWidth={1.75} />
            </View>
          ))}
        </View>
      </Section>

      <Section label={t("review.strengths")}>
        <Text style={[type.body, { paddingTop: space[4] }]}>{p.strengths}</Text>
      </Section>
    </Screen>
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
  logo: { width: 40, height: 40, padding: space[4], borderRadius: radius.badge, backgroundColor: "#EEEDF7" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 18 },
  sectionLabel: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 },
  inlineRow: { flexDirection: "row", alignItems: "center", paddingTop: space[4] },
  inlineInput: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 16, lineHeight: 24, color: color.ink, minHeight: 48 },
  areaInput: { marginTop: space[8], padding: space[12], borderWidth: 1, borderColor: color.controlOutline, borderRadius: radius.control, minHeight: 72, textAlignVertical: "top" },
  edit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[8] },
  tag: { ...type.meta, color: color.ink, paddingVertical: space[4], paddingHorizontal: space[12], backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: "rgba(232,231,237,0.8)", borderRadius: radius.badge, overflow: "hidden" },
  product: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[8], backgroundColor: "#FBF8FF", borderWidth: 1, borderColor: "rgba(232,231,237,0.6)", borderRadius: radius.control },
  productImage: { width: 56, height: 56, borderRadius: radius.control, backgroundColor: color.surface },
});
