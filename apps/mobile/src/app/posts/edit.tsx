import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BusinessChip, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge, CardTitle, SegmentedTabs, tint } from "@/ui/posts/controls";
import { BUSINESS, POSTS, getPost, splitCaption } from "@/ui/posts/sample";

const TABS = ["image", "caption", "brand"] as const;
type Tab = (typeof TABS)[number];

const sparkles = require("../../../assets/figma/posts/btn-sparkles.svg");

const back = () => (router.canGoBack() ? router.back() : router.navigate("/posts"));

/** P04 · Posts / Edit post: crop preview, then Image · Caption · Brand editors. */
export default function EditPost() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const post = getPost(id) ?? POSTS[0];
  const initial = splitCaption(post.caption);
  const [tab, setTab] = useState<Tab>("caption");
  const [caption, setCaption] = useState(initial.text.replace(/^«\s*|\s*»$/g, ""));

  return (
    <PostsScreen
      header={<PageHeader title={t("edit.title")} right={<BusinessChip />} />}
      contentStyle={{ paddingTop: space[12], paddingBottom: space[24] }}
      footer={
        <View style={styles.footerRow}>
          <Button label={t("edit.cancel")} variant="outline" height={48} style={{ flex: 1 }} onPress={back} />
          <Button label={t("edit.save")} style={{ flex: 2 }} onPress={back} />
        </View>
      }
    >
      {/* 4:5 crop preview with a rule-of-thirds grid. */}
      <View style={styles.preview} accessibilityLabel={t("edit.previewLabel", { title: post.title })}>
        <Image source={post.image} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.grid} pointerEvents="none">
          {[0, 1, 2].map((r) => (
            <View key={r} style={[styles.gridRow, r < 2 && styles.gridLineB]}>
              {[0, 1, 2].map((c) => (
                <View key={c} style={[{ flex: 1 }, c < 2 && styles.gridLineR]} />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.ratio}>
          <Text style={[type.meta, { color: color.onPrimary }]}>{t("edit.ratio")}</Text>
        </View>
      </View>

      <SegmentedTabs label={t("edit.sectionLabel")} options={TABS.map((value) => ({ value, label: t(`edit.tabs.${value}`) }))} value={tab} onChange={setTab} fill />

      {tab === "caption" ? (
        <>
          <View style={styles.box}>
            <View style={styles.between}>
              <CardTitle>{t("edit.description")}</CardTitle>
              <Text style={type.meta}>{t("edit.language")}</Text>
            </View>
            <View style={{ paddingTop: space[8] }}>
              <Field
                multiline
                value={caption}
                onChangeText={setCaption}
                accessibilityLabel={t("edit.description")}
                style={styles.textarea}
              />
            </View>
            <View style={styles.tags}>
              <Text style={type.meta}>{t("edit.suggestedHashtags")}</Text>
              <View style={styles.tagWrap}>
                {initial.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel={t("edit.addHashtag")} style={styles.add}>
                  <Text style={type.label}>{t("edit.add")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <Button label={t("edit.regenerate")} variant="outline" icon={sparkles} style={{ marginTop: space[16], marginBottom: space[20] }} />
        </>
      ) : (
        <View style={styles.box}>
          <CardTitle>{t(`edit.tabs.${tab}`)}</CardTitle>
          <Text style={[type.meta, { paddingTop: space[4] }]}>
            {tab === "image" ? t("edit.imageHint") : t("edit.brandHint", { brand: BUSINESS.name })}
          </Text>
        </View>
      )}
    </PostsScreen>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: "row", gap: space[8] },
  preview: { alignSelf: "center", width: 224, height: 280, borderRadius: radius.control, overflow: "hidden", backgroundColor: "#171717", borderWidth: 1, borderColor: "#E5E5E5" },
  grid: { position: "absolute", top: 16, left: 16, right: 16, bottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", borderRadius: radius.badge },
  gridRow: { flex: 1, flexDirection: "row" },
  gridLineB: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.2)" },
  gridLineR: { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.2)" },
  ratio: { position: "absolute", left: 10, bottom: 10, paddingVertical: 2, paddingHorizontal: space[8], borderRadius: 6, backgroundColor: "rgba(0,0,0,0.7)" },
  box: {
    marginTop: space[12],
    padding: space[16],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: tint.hair,
    borderRadius: radius.control,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: space[8] },
  textarea: { flex: 1, height: 96, fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.ink, textAlignVertical: "top", paddingVertical: 0 },
  tags: { marginTop: space[12], paddingTop: space[12], borderTopWidth: 1, borderTopColor: tint.hair },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[4], paddingTop: space[8] },
  add: { minHeight: 44, paddingHorizontal: space[8], alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: "#D4D4D4", borderRadius: radius.control },
});
