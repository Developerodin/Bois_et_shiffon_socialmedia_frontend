import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, Eye, Pencil, ShoppingBag } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { color, font, radius, space, type } from "@/theme/tokens";
import { TextButton, TitleHeader, mc, title16 } from "@/ui/marketing/kit";
import { brand, photos, websiteDraft } from "@/ui/marketing/sample";
import { ActionButton, ICON, Panel, ReelsScreen, Tag, bodyMuted, eyebrow, meta, rc } from "@/ui/reels/kit";

/**
 * M05 · Website Studio / Draft. No site backend: the preview renders the sample draft, and the
 * actions move through Edit content (M15) and Publish review (M18).
 */
export default function WebsiteDraft() {
  const { t } = useTranslation("marketing");
  const home = websiteDraft.pages.home;
  return (
    <ReelsScreen
      bg={color.canvas}
      glow={false}
      header={
        <TitleHeader
          title={t("shared.websiteStudio")}
          right={<Tag label={t("website.draftPreview")} style={styles.draftTag} textStyle={styles.draftTagText} />}
        />
      }
      contentStyle={{ paddingTop: space[16] }}
    >
      <Panel style={styles.domain}>
        <Image source={photos.bcFavicon} style={{ width: 16, height: 16, borderRadius: 3 }} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={[title16, { fontSize: 15 }]}>{brand.site}</Text>
          <Text style={[meta, { fontSize: 13 }]}>{t("website.catalogConnected")}</Text>
        </View>
        <TextButton label={t("website.connectDomain")} labelStyle={{ fontFamily: font.medium, fontSize: 14 }} onPress={() => router.push("/marketing/website-publish")} />
      </Panel>

      <View style={styles.browser} accessibilityLabel={t("website.previewLabel")}>
        <View style={styles.chrome}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.dot} />
            ))}
          </View>
          <View style={styles.url}>
            <Text style={[meta, { textAlign: "center" }]}>{t("website.browserTitle")}</Text>
          </View>
        </View>
        <View style={styles.site}>
          <View style={styles.siteNav}>
            <Text style={[type.label, { fontFamily: font.semibold }]}>{brand.name}</Text>
            <ShoppingBag size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </View>
          <Text style={[eyebrow, { paddingTop: space[16] }]}>{websiteDraft.eyebrow}</Text>
          <Text style={[title16, { paddingTop: space[12] }]}>{home.headline}</Text>
          <Text style={[bodyMuted, { paddingTop: space[12] }]}>{home.description}</Text>
          <View style={styles.hero}>
            <Image source={photos.diningTable} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={t("shared.diningTableImage")} />
            <View style={styles.caption}>
              <Text style={[meta, { color: color.onPrimary }]}>{websiteDraft.caption}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <ActionButton label={t("shared.editContent")} variant="outline" leading={Pencil} height={46} style={{ flex: 1 }} labelStyle={styles.outlineLabel} onPress={() => router.push("/marketing/website-edit")} />
        <ActionButton label={t("website.fullPreview")} variant="outline" leading={Eye} height={46} style={{ flex: 1 }} labelStyle={styles.outlineLabel} />
      </View>
      <ActionButton
        label={t("website.reviewPublish")}
        trailing={ArrowRight}
        height={52}
        style={{ marginTop: space[12] }}
        onPress={() => router.push("/marketing/website-publish")}
      />
      <Text style={[bodyMuted, { textAlign: "center", paddingTop: space[16] }]}>{t("website.footnote")}</Text>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  draftTag: { backgroundColor: mc.chrome, borderWidth: 1, borderColor: "#E4E3E9", paddingHorizontal: space[12] },
  draftTagText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  domain: { flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[12], paddingHorizontal: space[12] },
  browser: { marginTop: space[24], borderRadius: radius.card, borderWidth: 1, borderColor: rc.border, overflow: "hidden", backgroundColor: mc.siteBg },
  chrome: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingHorizontal: space[12],
    paddingVertical: space[8],
    backgroundColor: mc.chrome,
    borderBottomWidth: 1,
    borderBottomColor: rc.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E4E3E9" },
  url: { flex: 1, height: 22, justifyContent: "center", borderRadius: radius.badge, backgroundColor: color.surface },
  site: { padding: space[16] },
  siteNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: space[12],
    borderBottomWidth: 1,
    borderBottomColor: "#E9E9F0",
  },
  hero: { marginTop: space[16], height: 176, borderRadius: radius.control, overflow: "hidden", borderWidth: 1, borderColor: rc.fieldBorder },
  caption: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingVertical: 2,
    paddingHorizontal: space[8],
    borderRadius: radius.badge,
    backgroundColor: "rgba(25,22,32,0.72)",
  },
  actions: { flexDirection: "row", gap: space[12], marginTop: space[24] },
  outlineLabel: { fontFamily: font.semibold, fontSize: 15 },
});
