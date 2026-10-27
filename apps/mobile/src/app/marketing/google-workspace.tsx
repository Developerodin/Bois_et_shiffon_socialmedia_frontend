import { useState } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, Circle, CircleCheck, Plus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Trans, useTranslation } from "react-i18next";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Footer } from "@/ui/layout";
import { Divider, FloatingHeader, TextButton, mc, title16 } from "@/ui/marketing/kit";
import { brand, googleChecklist, googlePost, photos } from "@/ui/marketing/sample";
import { ActionButton, ICON, Panel, ReelsScreen, SegmentedTabs, Tag, bodyMuted, eyebrow, meta, metaInk, rc } from "@/ui/reels/kit";

const TABS = ["profile", "posts", "reviews"] as const;

/**
 * M14 · Google Growth / Workspace. Only the Posts tab is designed; Profile shows the setup
 * checklist on its own and Reviews hands over to the Customers reviews tab. With no Google
 * backend, post actions have no destination yet and do nothing.
 */
export default function GoogleWorkspace() {
  const { t } = useTranslation("marketing");
  const [tab, setTab] = useState<(typeof TABS)[number]>("posts");
  // SegmentedTabs shows its options as-is, so it gets translated labels; map the label back to the id.
  const tabLabels = TABS.map((id) => t(`googleWorkspace.tabs.${id}`));

  return (
    <ReelsScreen
      footer={
        <Footer>
          <ActionButton label={t("googleWorkspace.newPost")} leading={Plus} style={{ marginHorizontal: -4 }} />
        </Footer>
      }
      contentStyle={{ paddingTop: 0 }}
    >
      <FloatingHeader label={brand.name} fallback="/marketing/google" />
      <Text style={[type.pageTitle, { paddingTop: space[16] }]}>{t("shared.googleGrowth")}</Text>
      <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("googleWorkspace.subtitle")}</Text>

      <View style={{ marginTop: space[20] }}>
        <SegmentedTabs
          options={tabLabels}
          value={tabLabels[TABS.indexOf(tab)]}
          onChange={(label) => setTab(TABS[tabLabels.indexOf(label)] ?? tab)}
        />
      </View>

      {tab === "posts" ? (
        <Panel style={{ marginTop: space[20] }}>
          <View style={styles.rowBetween}>
            <Text style={eyebrow}>{t("googleWorkspace.draftPostTitle")}</Text>
            <Tag label={t("shared.draft")} style={styles.draftTag} textStyle={{ fontSize: 13 }} />
          </View>
          <View style={{ flexDirection: "row", gap: space[12], paddingTop: space[12] }}>
            <Image source={photos.diningTable} style={styles.postImage} contentFit="cover" accessibilityLabel={t("shared.diningTableImage")} />
            <View style={{ flex: 1 }}>
              <Text style={[title16, { fontSize: 15 }]}>{googlePost.title}</Text>
              <Text style={bodyMuted} numberOfLines={2}>
                {googlePost.body}
              </Text>
            </View>
          </View>
          <Divider style={{ marginTop: space[12] }} />
          <View style={[styles.rowBetween, { paddingTop: space[8] }]}>
            <Text style={metaInk}>
              <Trans t={t}
                ns="marketing"
                i18nKey="googleWorkspace.actionButton"
                values={{ action: t(`googleWorkspace.postActions.${googlePost.action}`) }}
                components={{ value: <Text style={styles.actionValue} /> }}
              />
            </Text>
            <TextButton label={t("googleWorkspace.reviewPost")} trailing={ArrowRight} />
          </View>
        </Panel>
      ) : null}

      {tab === "reviews" ? (
        <Panel style={{ marginTop: space[20] }}>
          <Text style={title16}>{t("googleWorkspace.reviewsTitle")}</Text>
          <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("googleWorkspace.reviewsBody")}</Text>
          <TextButton label={t("googleWorkspace.openReviews")} trailing={ArrowRight} onPress={() => router.push("/marketing/reviews")} style={{ alignSelf: "flex-start" }} />
        </Panel>
      ) : (
        <Panel style={{ marginTop: space[16] }}>
          <Text style={title16}>{t("googleWorkspace.checklistTitle")}</Text>
          <View style={{ paddingTop: space[8] }}>
            {googleChecklist.map((item) => {
              const Icon = item.done ? CircleCheck : Circle;
              const value = t(`googleWorkspace.checklist.${item.id}.value`);
              return (
                <View key={item.id} style={[styles.rowBetween, { minHeight: 44 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], flexShrink: 1 }}>
                    <Icon size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
                    <Text style={[meta, { fontSize: 13 }]}>{t(`googleWorkspace.checklist.${item.id}.label`)}</Text>
                  </View>
                  {item.done ? <Text style={[metaInk, { fontSize: 13 }]}>{value}</Text> : <TextButton label={value} />}
                </View>
              );
            })}
          </View>
        </Panel>
      )}
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  draftTag: { backgroundColor: mc.iconCircle, paddingVertical: 2, paddingHorizontal: space[8] },
  postImage: { width: 64, height: 64, borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
  actionValue: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
});
