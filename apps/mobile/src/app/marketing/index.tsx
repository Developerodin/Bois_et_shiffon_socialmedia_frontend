import { useState } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { ArrowRight, Briefcase, ChevronDown, ImagePlus, LayoutTemplate, MapPinned, MessagesSquare, X, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { color, radius, space, type } from "@/theme/tokens";
import { Divider, mc } from "@/ui/marketing/kit";
import { brand, photos } from "@/ui/marketing/sample";
import { ICON, ModuleHeader, Panel, ReelsScreen, bodyMuted, eyebrow, rc } from "@/ui/reels/kit";

/** `id` picks the card copy: tools.cards.<id>.title / body / cta in the marketing namespace. */
type Tool = { id: "customers" | "google" | "website" | "business"; Icon: LucideIcon; href: Href };

/**
 * The frame stops after Customers and Google Growth; Website Studio and Business continue the
 * grid below the fold so every Marketing flow (and the Business area) is reachable from here.
 */
const TOOLS: Tool[] = [
  { id: "customers", Icon: MessagesSquare, href: "/marketing/inbox" },
  { id: "google", Icon: MapPinned, href: "/marketing/google" },
  { id: "website", Icon: LayoutTemplate, href: "/marketing/website" },
  // "/business" is built separately; cast until its route file exists in the typed-route map.
  { id: "business", Icon: Briefcase, href: "/business" as Href },
];

/** M01 · Marketing / Tools. */
export default function MarketingTools() {
  const { t } = useTranslation("marketing");
  const [showCue, setShowCue] = useState(true);

  return (
    <ReelsScreen header={<ModuleHeader active="marketing" />} bg="#F8F8FC" glow={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("tools.switchBusiness", { name: brand.name })}
        onPress={() => router.push("/business" as Href)}
        style={styles.switcher}
      >
        <Image source={photos.bcFavicon} style={{ width: 20, height: 20, borderRadius: 4 }} contentFit="contain" />
        <Text style={type.label}>{brand.name}</Text>
        <ChevronDown size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
      </Pressable>

      <View style={{ paddingTop: space[24] }}>
        <Text style={type.pageTitle}>{t("tools.title")}</Text>
        <Text style={[bodyMuted, { paddingTop: 4 }]}>{t("tools.subtitle")}</Text>
      </View>

      {showCue ? (
        <Panel style={styles.cue}>
          <View>
            <Image source={photos.tvUnit} style={styles.cueImage} contentFit="cover" accessibilityLabel={t("tools.cue.imageLabel")} />
            <Pressable accessibilityRole="button" accessibilityLabel={t("tools.cue.dismiss")} onPress={() => setShowCue(false)} style={styles.close}>
              <X size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
            </Pressable>
          </View>
          <View style={styles.cueBody}>
            <View style={styles.cueIcon}>
              <ImagePlus size={16} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={eyebrow}>{t("tools.cue.eyebrow")}</Text>
              <Text style={[type.cardTitle, { paddingTop: 2 }]}>{t("tools.cue.title")}</Text>
              <Text style={[bodyMuted, { paddingTop: 2 }]}>{t("tools.cue.body")}</Text>
            </View>
          </View>
        </Panel>
      ) : null}

      <View style={styles.grid}>
        {TOOLS.map((tool) => (
          <ToolCard key={tool.id} {...tool} />
        ))}
      </View>
    </ReelsScreen>
  );
}

function ToolCard({ id, Icon, href }: Tool) {
  const { t } = useTranslation("marketing");
  const title = t(`tools.cards.${id}.title`);
  const body = t(`tools.cards.${id}.body`);
  const cta = t(`tools.cards.${id}.cta`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("tools.cardLabel", { title, body, cta })}
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.tool, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.toolTile}>
        <Icon size={24} color={color.primary} strokeWidth={ICON.strokeWidth} />
      </View>
      <Text style={[type.cardTitle, { paddingTop: space[16] }]}>{title}</Text>
      <Text style={[styles.toolBody, { flex: 1 }]}>{body}</Text>
      <Divider style={{ marginTop: space[16] }} />
      <View style={styles.toolCta}>
        <Text style={[type.body, { lineHeight: 20 }]}>{cta}</Text>
        <ArrowRight size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switcher: {
    alignSelf: "flex-start",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingLeft: space[12],
    paddingRight: space[16],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.controlOutline,
  },
  cue: { marginTop: space[24], padding: 0, overflow: "hidden" },
  cueImage: { width: "100%", height: 144, backgroundColor: mc.chrome },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: rc.border,
  },
  cueBody: { flexDirection: "row", gap: space[12], paddingHorizontal: space[20], paddingTop: space[20], paddingBottom: space[20] },
  cueIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: rc.black, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[16], marginTop: space[24] },
  tool: {
    flexBasis: "45%",
    flexGrow: 1,
    padding: space[20],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: rc.border,
    borderRadius: radius.card,
  },
  toolTile: {
    width: 48,
    height: 48,
    borderRadius: radius.control,
    backgroundColor: mc.tile,
    borderWidth: 1,
    borderColor: mc.tileBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  toolBody: { fontFamily: type.body.fontFamily, fontSize: 13, lineHeight: 18, color: color.inkSecondary, paddingTop: 4 },
  toolCta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: -8 },
});
