import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, Clock, LockOpen, WandSparkles } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BusinessSwitcher } from "@/ui/posts/chrome";
import { PlansModuleHeader } from "@/ui/plans/kit";
import { photos, product } from "@/ui/plans/sample";
import { ActionButton, BottomNav, ICON, Panel, ReelsScreen, Tag, meta, metaInk } from "@/ui/reels/kit";

/** L01 · No subscription / Reels home. Ideas and storyboards stay open; rendering needs a plan. */
/** Sample idea count shown in the notice and the "ideas ready" row. */
const IDEAS = 21;

export default function ReelsNoPlan() {
  const { t } = useTranslation("plans");
  const ideas = { count: IDEAS, n: formatNumber(IDEAS) };
  return (
    <ReelsScreen bg="#FBFBFE" header={<PlansModuleHeader active="reels" />} footer={<BottomNav active="create" />}>
      <View style={styles.topRow}>
        <BusinessSwitcher />
        <View style={styles.crumb}>
          <Clock size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
          <Text style={meta}>{t("reels.home")}</Text>
        </View>
      </View>

      <View style={{ paddingTop: space[32] }}>
        <Text style={type.pageTitle}>{t("reels.title")}</Text>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: 2 }]}>{t("reels.subtitle")}</Text>
      </View>

      <Panel style={styles.notice}>
        <View style={styles.lock}>
          <LockOpen size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.noticeText}>{t("reels.notice", ideas)}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/plans")} style={styles.link}>
            <Text style={[type.label, { fontFamily: font.semibold }]}>{t("viewPlans")}</Text>
            <ArrowRight size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </Pressable>
        </View>
      </Panel>

      <Panel style={styles.assistant}>
        <Image source={photos.diningInterior} style={styles.hero} contentFit="cover" accessibilityLabel={t("reels.heroAlt", { product })} />
        <View style={styles.promptHead}>
          <Text style={meta}>{t("reels.creativePrompt")}</Text>
          <Tag label={t("reels.yourAssistant")} style={{ backgroundColor: "#F4F2FD", paddingVertical: 4, paddingHorizontal: space[8] }} />
        </View>
        <Text style={[type.feature, { fontSize: 16, lineHeight: 22, paddingTop: space[12] }]}>{t("reels.question")}</Text>
        <View style={styles.plan}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[12], flexShrink: 1 }}>
            <WandSparkles size={20} color="#64646F" strokeWidth={ICON.strokeWidth} />
            <Text style={metaInk}>{t("reels.planTogether")}</Text>
          </View>
          <ActionButton label={t("reels.start")} onPress={() => router.push("/reels/chat")} accessibilityLabel={t("reels.startA11y")} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push("/reels/ideas")} style={styles.ideas}>
          <Text style={meta}>{t("reels.ideasReady", ideas)}</Text>
          <Text style={[type.label, { fontFamily: font.semibold }]}>{t("reels.viewIdeas")}</Text>
        </Pressable>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  crumb: { flexDirection: "row", alignItems: "center", gap: 6 },
  notice: { marginTop: space[24], flexDirection: "row", gap: space[12], paddingRight: space[24] },
  lock: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#F4F2FD", alignItems: "center", justifyContent: "center" },
  noticeText: { ...type.body, lineHeight: 21 },
  link: { flexDirection: "row", alignItems: "center", gap: space[8], minHeight: 44, alignSelf: "flex-start", marginTop: space[8] },
  assistant: { marginTop: space[24], overflow: "hidden" },
  hero: { height: 184, marginTop: -20, marginHorizontal: -20, backgroundColor: "#E8E4DC" },
  promptHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space[20] },
  plan: {
    marginTop: space[16],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[8],
    paddingRight: space[8],
    paddingLeft: space[16],
    backgroundColor: "rgba(244,242,253,0.7)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
  },
  ideas: { minHeight: 44, marginTop: space[8], flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
