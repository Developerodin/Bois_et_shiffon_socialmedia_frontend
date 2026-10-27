import type { ReactNode } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { GalleryHorizontalEnd, Image as ImageIcon } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Card } from "@/ui/layout";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BottomNav, BusinessSwitcher, ModuleHeader, PostsScreen } from "@/ui/posts/chrome";
import { CardTitle, Pill, tint } from "@/ui/posts/controls";
import type { PostChannel } from "@/ui/posts/sample";

const GOALS = ["newArrival", "productFeature", "specialOffer"] as const;
const PRODUCT = { name: "Table rectangulaire 240cm", collection: "Collection Acacia Bunting", image: require("../../../assets/figma/onboarding/bunting-dining-room.png") };
const draftIcon = require("../../../assets/figma/posts/btn-draft-white.svg");

/** P06 · Posts / Create brief: format, goal, product and optional direction for a new post. */
export default function CreateBrief() {
  const { t } = useTranslation("posts");
  const [format, setFormat] = useState<Extract<PostChannel, "INSTAGRAM_POST" | "INSTAGRAM_CAROUSEL">>("INSTAGRAM_POST");
  const [goal, setGoal] = useState<(typeof GOALS)[number]>("newArrival");
  const [direction, setDirection] = useState("");

  return (
    <PostsScreen
      header={<ModuleHeader />}
      nav={<BottomNav active="create" />}
      footer={<Button label={t("brief.draftPost")} icon={draftIcon} onPress={() => router.push("/posts/table-bunting")} />}
    >
      <BusinessSwitcher />
      <View style={{ paddingTop: space[24] }}>
        <Text style={type.pageTitle} accessibilityRole="header">
          {t("brief.title")}
        </Text>
        <Text style={type.meta}>{t("brief.subtitle")}</Text>
      </View>

      <Card style={styles.card}>
        <CardTitle>{t("brief.format")}</CardTitle>
        <View style={styles.formats} accessibilityRole="radiogroup" accessibilityLabel={t("brief.formatLabel")}>
          <Format
            selected={format === "INSTAGRAM_POST"}
            onPress={() => setFormat("INSTAGRAM_POST")}
            icon={<ImageIcon size={20} color={color.ink} strokeWidth={1.75} />}
            title={t("brief.singlePhoto")}
            detail={t("brief.singlePhotoDetail")}
          />
          <Format
            selected={format === "INSTAGRAM_CAROUSEL"}
            onPress={() => setFormat("INSTAGRAM_CAROUSEL")}
            icon={<GalleryHorizontalEnd size={20} color={color.ink} strokeWidth={1.75} />}
            title={t("brief.carousel")}
            detail={t("brief.carouselDetail")}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <CardTitle>{t("brief.goal")}</CardTitle>
        <View style={styles.goals} accessibilityRole="radiogroup" accessibilityLabel={t("brief.goal")}>
          {GOALS.map((g) => (
            <Pill key={g} label={t(`brief.goals.${g}`)} selected={g === goal} onPress={() => setGoal(g)} />
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <CardTitle>{t("brief.product")}</CardTitle>
        <View style={styles.product}>
          <Image source={PRODUCT.image} style={styles.productImg} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
              {PRODUCT.name}
            </Text>
            <Text style={type.meta}>{PRODUCT.collection}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t("brief.changeProduct")} style={styles.change}>
            <Text style={type.label}>{t("brief.change")}</Text>
          </Pressable>
        </View>
      </Card>

      <View style={styles.direction}>
        <View style={styles.between}>
          <CardTitle>{t("brief.direction")}</CardTitle>
          <Text style={type.meta}>{t("brief.directionLanguage")}</Text>
        </View>
        <View style={{ paddingTop: space[8], paddingBottom: space[8] }}>
          <Field
            value={direction}
            onChangeText={setDirection}
            placeholder={t("brief.directionPlaceholder")}
            accessibilityLabel={t("brief.direction")}
            height={50}
            style={styles.input}
          />
        </View>
        <View style={[styles.between, styles.cost]}>
          <Text style={type.meta}>{t("brief.cost")}</Text>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("brief.costPending")}</Text>
        </View>
      </View>
    </PostsScreen>
  );
}

function Format({ selected, onPress, icon, title, detail }: { selected: boolean; onPress: () => void; icon: ReactNode; title: string; detail: string }) {
  const { t } = useTranslation("posts");
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t("brief.formatOption", { title, detail })}
      onPress={onPress}
      style={[styles.format, selected ? styles.formatOn : styles.formatOff]}
    >
      {icon}
      <View style={{ flexShrink: 1 }}>
        <Text style={selected ? [type.label, { fontFamily: "Inter_600SemiBold" }] : [type.meta, { color: color.ink }]}>{title}</Text>
        <Text style={type.meta}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space[24], padding: space[12] },
  formats: { flexDirection: "row", gap: space[16], paddingTop: space[8] },
  format: { flex: 1, minHeight: 66, flexDirection: "row", alignItems: "center", gap: space[8], borderRadius: radius.control },
  // Selected border is 2px, so padding drops by 1 to keep the content still.
  formatOn: { padding: 11, backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary },
  formatOff: { padding: 12, backgroundColor: color.surface, borderWidth: 1, borderColor: "#E4E3E9" },
  goals: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: 10, paddingBottom: space[4] },
  product: { flexDirection: "row", alignItems: "center", marginTop: space[8], padding: space[8], borderWidth: 1, borderColor: "#E5E5E5", borderRadius: radius.control },
  productImg: { width: 44, height: 44, marginRight: space[12], borderRadius: radius.control, backgroundColor: tint.hair },
  change: { minWidth: 44, minHeight: 44, paddingHorizontal: space[8], alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  direction: {
    marginTop: space[24],
    padding: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: tint.hair,
    borderRadius: radius.control,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  input: { flex: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 19, color: color.ink, paddingVertical: 10 },
  cost: { paddingTop: space[4], borderTopWidth: 1, borderTopColor: tint.hair },
});
