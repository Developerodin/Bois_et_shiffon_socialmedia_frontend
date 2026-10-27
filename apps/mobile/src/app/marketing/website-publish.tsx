import { Image } from "expo-image";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { BrandInline, TextButton, goBack, mc, title16 } from "@/ui/marketing/kit";
import { brand, photos, websiteDraft, websitePages } from "@/ui/marketing/sample";
import { BackButton, PageHeader, Panel, ReelsScreen, Tag, bodyMuted, meta, rc } from "@/ui/reels/kit";

/**
 * M18 · Website Studio / Publish review. No domain or hosting backend exists, so the domain
 * stays "Not connected" and "Publish website" stays disabled, as designed for this state.
 */
export default function WebsitePublishReview() {
  const { t } = useTranslation("marketing");
  return (
    <ReelsScreen
      bg={color.canvas}
      glow={false}
      header={<PageHeader left={<BackButton onPress={() => goBack("/marketing/website")} />} center={<BrandInline />} right={<View style={{ width: 44 }} />} />}
      footer={
        <Footer>
          <Text style={[bodyMuted, { textAlign: "center" }]}>{t("websitePublish.footnote")}</Text>
          <Button label={t("websitePublish.publish")} disabled style={{ marginHorizontal: -4 }} />
          <Button label={t("websitePublish.keepDraft")} variant="ghost" height={44} onPress={() => goBack("/marketing/website")} style={{ marginTop: -4 }} />
        </Footer>
      }
      contentStyle={{ paddingTop: space[24] }}
    >
      <Text style={type.pageTitle}>{t("websitePublish.title")}</Text>
      <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("websitePublish.subtitle")}</Text>

      <Panel style={{ marginTop: space[24] }}>
        <View style={styles.rowBetween}>
          <Text style={title16}>{brand.name}</Text>
          <Tag label={t("shared.draft")} style={styles.tag} textStyle={{ color: color.ink, fontSize: 13 }} />
        </View>
        <Image source={photos.diningTable} style={styles.hero} contentFit="cover" accessibilityLabel={t("websitePublish.heroImageLabel")} />
        <Text style={[title16, { paddingTop: space[16] }]}>{websiteDraft.pages.home.headline}</Text>
        <View style={[styles.rowBetween, { paddingTop: space[12] }]}>
          <Text style={meta}>{websitePages.map((p) => t(`shared.pages.${p}`)).join(" · ")}</Text>
          <TextButton label={t("shared.editContent")} labelStyle={{ fontFamily: font.medium }} onPress={() => router.push("/marketing/website-edit")} />
        </View>
      </Panel>

      <Panel style={{ marginTop: space[16] }}>
        <View style={styles.rowBetween}>
          <Text style={title16}>{t("websitePublish.destinationTitle")}</Text>
          <Text style={meta}>{t("shared.status.notConnected")}</Text>
        </View>
        <Text style={[bodyMuted, { paddingTop: space[12] }]}>{t("websitePublish.destinationBody")}</Text>
        {/* No domain flow is designed yet; the button is shown but has no destination. */}
        <Button label={t("websitePublish.setUpDomain")} variant="outline" height={44} style={styles.domainButton} />
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  tag: { backgroundColor: mc.chrome, paddingVertical: 4, paddingHorizontal: space[12], borderRadius: radius.badge + 2 },
  hero: { width: "100%", height: 150, marginTop: space[12], borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
  domainButton: { marginTop: space[16], borderColor: rc.border },
});
