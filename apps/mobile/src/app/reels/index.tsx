import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { ChevronDown, LayoutTemplate, Sparkle, Store, UserRound, WandSparkles, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { currentBrand, opportunities, type ReelSummary, reels } from "@/api/endpoints";
import { color, radius, space, type } from "@/theme/tokens";
import { BottomNav, ICON, ModuleHeader, Panel, ReelsScreen, Tag, ActionButton, meta, metaInk, strong14 } from "@/ui/reels/kit";
import { openReel } from "@/ui/reels/use-reel";
import { usePlan } from "@/ui/plans/use-plan";

const statusOf = (r: ReelSummary) => (r.render && r.render.step !== "DONE" && r.render.step !== "FAILED" ? "processing" : r.videoUrl ? "ready" : "draft");

/** R01 · Reels / Create. */
export default function ReelsCreate() {
  const { t } = useTranslation("reels");
  const [name, setName] = useState("");
  const [ideas, setIdeas] = useState(0);
  const [recent, setRecent] = useState<ReelSummary[]>([]);
  // No plan: making videos is locked, so the No-subscription Reels home (L01) shows instead.
  const { loaded, planned } = usePlan();
  useEffect(() => {
    if (!loaded) return;
    if (!planned) router.replace("/plans/reels");
  }, [loaded, planned]);
  // On every visit, not just the first: a reel made or finished since shows up when the person comes back.
  useFocusEffect(
    useCallback(() => {
      currentBrand().then((b) => setName(b.name), () => {});
      opportunities().then((r) => setIdeas(r.opportunities.filter((o) => o.channels.includes("INSTAGRAM_REEL") && o.decision !== "REJECT").length), () => {});
      reels.list().then((r) => setRecent(r.reels.slice(0, 2)), () => {});
    }, []),
  );
  return (
    <ReelsScreen bg="#FBFBFE" header={<ModuleHeader />} footer={<BottomNav active="create" />}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("create.switchBusiness", { name })} onPress={() => router.push("/business/menu")} style={styles.switcher}>
        <Store size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
        <Text style={type.label}>{name}</Text>
        <ChevronDown size={16} color="#64646F" strokeWidth={ICON.strokeWidth} />
      </Pressable>

      <View style={{ paddingTop: space[24] }}>
        <Text style={type.pageTitle}>{t("create.title")}</Text>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: 2 }]}>{t("create.subtitle")}</Text>
      </View>

      <Panel style={styles.assistant}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
          <View style={styles.sparkle}>
            <Sparkle size={20} color="#4C40BB" strokeWidth={ICON.strokeWidth} />
          </View>
          <Text style={meta}>{t("assistant")}</Text>
        </View>
        <Text style={[type.feature, { letterSpacing: -0.3, paddingTop: space[12] }]}>{t("create.question")}</Text>
        <View style={styles.plan}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[12], flexShrink: 1 }}>
            <WandSparkles size={20} color="#64646F" strokeWidth={ICON.strokeWidth} />
            <Text style={metaInk}>{t("create.planTogether")}</Text>
          </View>
          <ActionButton label={t("create.start")} onPress={() => (openReel(null), router.push("/reels/chat"))} accessibilityLabel={t("create.startA11y")} />
        </View>
        <View style={styles.ideasRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <View style={styles.dot} />
            <Text style={meta}>{t("create.ideasReady", { count: ideas })}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/reels/ideas")} style={styles.textButton}>
            <Text style={strong14}>{t("create.viewIdeas")}</Text>
          </Pressable>
        </View>
      </Panel>

      <View style={styles.shortcuts}>
        <Shortcut Icon={UserRound} title={t("aiActor")} subtitle={t("create.actorSubtitle")} onPress={() => (openReel(null), router.push("/reels/actor"))} />
        <Shortcut Icon={LayoutTemplate} title={t("create.templates")} subtitle={t("create.templatesSubtitle")} onPress={() => (openReel(null), router.push("/reels/templates"))} />
      </View>

      <View style={{ paddingTop: 28 }}>
        <View style={styles.sectionHead}>
          <Text style={strong14}>{t("create.jumpBackIn")}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/reels/results")} style={styles.textButton}>
            <Text style={type.label}>{t("create.seeAll")}</Text>
          </Pressable>
        </View>
        <View style={[styles.shortcuts, { paddingTop: space[12] }]}>
          {recent.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={t("create.recentA11y", { title: r.title, status: t(`status.${statusOf(r)}`) })}
              onPress={() => (openReel(r.id), router.push(statusOf(r) === "draft" ? "/reels/storyboard" : statusOf(r) === "processing" ? "/reels/generating" : "/reels/review"))}
              style={styles.recent}
            >
              <View>
                <Image source={r.thumbUrl ? { uri: r.thumbUrl } : undefined} style={{ height: 128, backgroundColor: "#F0EEF6" }} contentFit="cover" />
                <Tag label={t(`status.${statusOf(r)}`)} tone="white" style={styles.status} textStyle={{ color: color.ink }} />
              </View>
              <View style={{ padding: space[12] }}>
                <Text style={strong14} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[meta, { paddingTop: 2 }]} numberOfLines={1}>
                  {r.seconds ? t("create.recentMeta", { seconds: r.seconds }) : ""}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </ReelsScreen>
  );
}

function Shortcut({ Icon, title, subtitle, onPress }: { Icon: LucideIcon; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${subtitle}`} onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.85 }]}>
      <View style={styles.shortcutIcon}>
        <Icon size={20} color={color.primary} strokeWidth={ICON.strokeWidth} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[strong14, { color: "#000" }]}>{title}</Text>
        <Text style={[type.label, { color: color.disabledInk }]}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switcher: {
    alignSelf: "flex-start",
    width: 180,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingHorizontal: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  assistant: { marginTop: space[24], overflow: "hidden" },
  sparkle: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.selection, alignItems: "center", justifyContent: "center" },
  plan: {
    marginTop: space[12],
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
  ideasRow: {
    marginTop: space[12],
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F2F1F6",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.7)" },
  textButton: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  shortcuts: { flexDirection: "row", gap: space[16], paddingTop: space[24] },
  shortcut: {
    flex: 1,
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    padding: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 6px rgba(45,36,87,0.06)",
  },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recent: {
    flex: 1,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "#DED9E6",
    borderRadius: radius.card,
    overflow: "hidden",
  },
  status: { position: "absolute", top: 8, left: 8, borderRadius: 9999, borderWidth: 0, paddingHorizontal: space[8] },
});

