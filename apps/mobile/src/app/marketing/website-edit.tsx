import { useState } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { GripVertical, Images } from "lucide-react-native";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer, Label } from "@/ui/layout";
import { FloatingHeader, TextButton, goBack, title16 } from "@/ui/marketing/kit";
import { brand, photos, websiteDraft, websitePages, type WebsitePage } from "@/ui/marketing/sample";
import { ICON, Panel, ReelsScreen, SegmentedTabs, meta, rc } from "@/ui/reels/kit";

/**
 * M15 · Website Studio / Edit content. Edits live in local state only: there is no site backend,
 * so "Save draft changes" returns to the draft and the copy resets on the next visit.
 */
export default function WebsiteEdit() {
  const { t } = useTranslation("marketing");
  const [page, setPage] = useState<WebsitePage>("home");
  // SegmentedTabs shows its options as-is, so it gets translated labels; map the label back to the page id.
  const pageLabels = websitePages.map((p) => t(`shared.pages.${p}`));
  const [copy, setCopy] = useState<Record<WebsitePage, { headline: string; description: string }>>(() => ({ ...websiteDraft.pages }));
  const current = copy[page];
  const update = (patch: Partial<{ headline: string; description: string }>) => setCopy((c) => ({ ...c, [page]: { ...c[page], ...patch } }));

  return (
    <ReelsScreen
      footer={
        <Footer>
          <Button label={t("websiteEdit.saveChanges")} onPress={() => goBack("/marketing/website")} style={{ marginHorizontal: -4 }} />
          <Button label={t("websiteEdit.reviewPublish")} variant="outline" onPress={() => router.push("/marketing/website-publish")} style={{ marginTop: -4, marginHorizontal: -4 }} />
        </Footer>
      }
      contentStyle={{ paddingTop: 0 }}
    >
      <FloatingHeader label={brand.site} fallback="/marketing/website" right={<TextButton label={t("websiteEdit.preview")} onPress={() => goBack("/marketing/website")} />} />
      <Text style={[type.pageTitle, { paddingTop: space[8] }]}>{t("websiteEdit.title")}</Text>

      <View style={{ marginTop: space[16] }}>
        <SegmentedTabs
          options={pageLabels}
          value={pageLabels[websitePages.indexOf(page)]}
          onChange={(label) => setPage(websitePages[pageLabels.indexOf(label)] ?? page)}
        />
      </View>

      <Panel style={{ marginTop: space[16] }}>
        <View style={styles.rowBetween}>
          <Text style={[title16, { fontSize: 15 }]}>{t("websiteEdit.heroTitle")}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <Images size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
            <TextButton label={t("websiteEdit.replaceImage")} labelStyle={{ fontFamily: font.medium, fontSize: 14 }} />
          </View>
        </View>
        <View style={styles.hero}>
          <Image source={photos.diningTable} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={t("websiteEdit.heroImageLabel")} />
          <View style={styles.heroTag}>
            <Text style={[meta, { color: color.ink, fontSize: 13 }]}>{brand.name}</Text>
          </View>
        </View>

        <View style={{ paddingTop: space[24] }}>
          <Label>{t("websiteEdit.headline")}</Label>
          <TextInput value={current.headline} onChangeText={(headline) => update({ headline })} accessibilityLabel={t("websiteEdit.headline")} style={styles.input} />
        </View>
        <View style={{ paddingTop: space[16] }}>
          <Label>{t("websiteEdit.description")}</Label>
          <TextInput
            value={current.description}
            onChangeText={(description) => update({ description })}
            accessibilityLabel={t("websiteEdit.description")}
            multiline
            style={[styles.input, styles.textarea]}
          />
        </View>
      </Panel>

      <Panel style={{ marginTop: space[16] }}>
        <View style={styles.rowBetween}>
          <Text style={[title16, { fontSize: 15 }]}>{t("websiteEdit.sectionsTitle")}</Text>
          <Text style={[meta, { fontSize: 13 }]}>{t("websiteEdit.sectionCount", { count: websiteDraft.sections.length })}</Text>
        </View>
        {/* Below the frame's fold: section rows are inferred from the visible list's first edge. */}
        <View style={{ gap: space[8], paddingTop: space[16] }}>
          {websiteDraft.sections.map((s) => (
            <View key={s} style={styles.section}>
              <GripVertical size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
              <Text style={[styles.inputText, { fontSize: 14, lineHeight: 20 }]}>{t(`websiteEdit.sections.${s}`)}</Text>
            </View>
          ))}
        </View>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  hero: { marginTop: space[16], height: 128, borderRadius: radius.control, overflow: "hidden", borderWidth: 1, borderColor: rc.fieldBorder },
  heroTag: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingVertical: 2,
    paddingHorizontal: space[12],
    borderRadius: radius.badge,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  inputText: { fontFamily: font.regular, color: color.ink },
  input: {
    minHeight: 48,
    paddingHorizontal: space[12],
    paddingVertical: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.controlOutline,
    backgroundColor: color.surface,
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 24,
    color: color.ink,
  },
  textarea: { minHeight: 74, textAlignVertical: "top" },
  section: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    minHeight: 48,
    paddingHorizontal: space[12],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: rc.border,
  },
});
