import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, CalendarDays, Lock } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { formatDate } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BottomNav, BusinessSwitcher } from "@/ui/posts/chrome";
import { LockTag, PlansModuleHeader } from "@/ui/plans/kit";
import { coverSource, usePosts } from "@/ui/posts/use-posts";
import { usePlan } from "@/ui/plans/use-plan";
import { ActionButton, ICON, Panel, ReelsScreen, eyebrow } from "@/ui/reels/kit";
import { useEffect, useState } from "react";

/** L05 · No subscription / Posts offer. */
export default function PostsOffer() {
  const { t } = useTranslation("plans");
  const { items } = usePosts();
  const { planned } = usePlan();
  useEffect(() => {
    if (planned) router.replace("/posts");
  }, [planned]);
  // The next dated post (or the newest draft) and the four days around it, locked behind the plan.
  const [now] = useState(() => new Date());
  const next = (items ?? []).filter((p) => !p.studio && p.scheduledFor && new Date(p.scheduledFor) >= now).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!))[0] ?? (items ?? []).find((p) => !p.studio);
  const at = next?.scheduledFor ? new Date(next.scheduledFor) : now;
  const days = [-1, 0, 1, 2].map((d) => new Date(at.getFullYear(), at.getMonth(), at.getDate() + d));
  const month = formatDate(at, { month: "long", year: "numeric" });
  return (
    <ReelsScreen header={<PlansModuleHeader active="posts" />} footer={<BottomNav active="today" />}>
      <BusinessSwitcher />
      <View style={{ paddingTop: space[16] }}>
        <Text style={type.pageTitle}>{t("posts.title")}</Text>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: 2 }]}>{t("posts.subtitle")}</Text>
      </View>

      <Panel style={{ marginTop: space[16] }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Text style={eyebrow}>{t("posts.subscriptionFeature")}</Text>
          <LockTag label={t("posts.inactive")} />
        </View>
        <Text style={[type.cardTitle, { fontSize: 16, paddingTop: space[12] }]}>{t("posts.monthlyPlan")}</Text>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[8] }]}>
          {t("posts.unlock")}
        </Text>

        <View style={styles.calendar} accessibilityLabel={t("posts.calendarA11y", { month })}>
          <View style={[styles.row, styles.calHead]}>
            <CalendarDays size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
            <Text style={[type.label, { flex: 1, fontFamily: font.semibold }]}>{month}</Text>
            <Text style={type.meta}>{t("posts.draftSchedule")}</Text>
          </View>
          <View style={[styles.row, { justifyContent: "space-around", paddingVertical: space[12] }]}>
            {days.map((d, i) => (
              <Text key={d.toISOString()} style={[type.meta, i === 1 && { color: color.ink, fontFamily: font.medium }]}>
                {t("posts.day", { weekday: formatDate(d, { weekday: "short" }), day: formatDate(d, { day: "numeric" }) })}
              </Text>
            ))}
          </View>
          {next ? <View style={styles.post}>
            <View>
              <Image source={coverSource(next)} style={styles.thumb} contentFit="cover" accessibilityLabel={next.title} />
              <View style={styles.lockOver}>
                <Lock size={16} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.label} numberOfLines={1}>
                {next.title}
              </Text>
              {next.scheduledFor ? <Text style={[type.meta, { color: color.ink }]}>{t("posts.postMeta", { time: formatDate(at, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) })}</Text> : null}
            </View>
          </View> : null}
        </View>

        <View style={{ gap: space[8], paddingTop: space[16] }}>
          <ActionButton label={t("viewPlans")} trailing={ArrowRight} onPress={() => router.push("/plans")} />
          <ActionButton label={t("posts.keepDrafting")} variant="ghost" onPress={() => router.push("/posts/brief")} />
        </View>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  calendar: { marginTop: space[16], padding: space[12], borderRadius: radius.control, backgroundColor: "#F9F8FC", borderWidth: 1, borderColor: color.divider },
  calHead: { gap: space[12], paddingBottom: space[12], paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: color.divider },
  post: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    padding: space[8],
    borderRadius: radius.control,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
  },
  thumb: { width: 40, height: 40, borderRadius: 20 },
  lockOver: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "rgba(16,16,20,0.15)" },
});
