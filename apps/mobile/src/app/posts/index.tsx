import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, Clock, SquarePen } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Glow } from "@/ui/aura";
import { Button } from "@/ui/button";
import { color, radius, space, type } from "@/theme/tokens";
import { BottomNav, BusinessSwitcher, ModuleHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge } from "@/ui/posts/controls";
import { CHANNEL_LABEL, STATUS_KEY, isLockedIn, relativeSlot, upcomingThisWeek } from "@/ui/posts/sample";
import { coverSource, coverUrl, openPost, usePosts } from "@/ui/posts/use-posts";
import { usePlan } from "@/ui/plans/use-plan";
import { useEffect } from "react";

/** P01 · Posts / Today: the post waiting for approval and this week's agenda. */
export default function PostsToday() {
  const { t } = useTranslation("posts");
  const { items, error, loading, reload } = usePosts();
  // No plan: the calendar is locked, so the No-subscription Posts home (L05) shows instead.
  const { loaded, planned } = usePlan();
  useEffect(() => {
    if (loaded && !planned) router.replace("/plans/posts");
  }, [loaded, planned]);
  // Studio reels are approved in Reels (R07); this card is for the agents' posts.
  const pending = items?.find((p) => p.status === "AWAITING_APPROVAL" && !p.studio);
  const agenda = upcomingThisWeek(items ?? []).slice(0, 2);
  const product = pending?.brief?.products?.[0];
  const format = pending && (pending.channel === "INSTAGRAM_CAROUSEL" ? t("today.slides", { count: pending.latest?.body.slides.length ?? 0 }) : CHANNEL_LABEL[pending.channel]);

  return (
    <PostsScreen header={<ModuleHeader />} nav={<BottomNav active="today" />} background={color.canvasAlt}>
      <Glow height={360} />
      <View style={{ height: 56 }}>
        <BusinessSwitcher />
      </View>
      <Text style={type.pageTitle} accessibilityRole="header">
        {t("today.title")}
      </Text>
      <Text style={[type.body, { color: color.inkSecondary, paddingTop: 2 }]}>{t("today.subtitle")}</Text>

      {loading ? <ActivityIndicator color={color.primary} style={{ marginTop: space[24] }} /> : null}
      {error && !items ? (
        <View style={[styles.section, styles.agenda, { gap: space[12] }]}>
          <Text style={type.body}>{t("today.loadFailed")}</Text>
          <Button label={t("today.retry")} variant="outline" onPress={() => void reload()} />
        </View>
      ) : null}

      {pending ? (
        <View style={[styles.section, styles.approval]}>
          <View style={styles.between}>
            <Text style={styles.eyebrow}>{t("today.needsApproval")}</Text>
            <Badge tone="soft" dot>{t("today.channelStatus", { channel: CHANNEL_LABEL[pending.channel], status: t(STATUS_KEY[pending.status]) })}</Badge>
          </View>
          <View style={{ paddingTop: space[12], gap: space[12] }}>
            <View style={styles.photo}>
              {coverUrl(pending) ? <Image source={coverSource(pending)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={pending.title} /> : null}
            </View>
            <View style={{ paddingHorizontal: 2 }}>
              <Text style={[type.cardTitle, { letterSpacing: -0.24 }]}>{pending.title}</Text>
              {product ? <Text style={[type.meta, { paddingTop: 4 }]}>{product}</Text> : null}
              <Text style={[type.meta, { paddingTop: 4 }]}>{format}</Text>
            </View>
          </View>
          <Button label={t("today.reviewPost")} arrow style={{ marginTop: space[16] }} onPress={() => openPost(pending)} />
        </View>
      ) : null}

      {items ? <View style={[styles.section, styles.agenda]}>
        <View style={styles.between}>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]} accessibilityRole="header">
            {t("today.agenda")}
          </Text>
          <Text style={type.meta}>{t("today.thisWeek")}</Text>
        </View>
        <View style={{ paddingTop: space[12], gap: space[12] }}>
          {agenda.length === 0 ? <Text style={[type.body, { color: color.inkSecondary }]}>{t("today.empty")}</Text> : null}
          {agenda.map((p) => {
            const locked = isLockedIn(p.status);
            const status = t(STATUS_KEY[p.status]);
            return (
              <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={t("today.slotLabel", { title: p.title, when: relativeSlot(p.scheduledFor!), status })}
                  onPress={() => openPost(p)}
                  style={({ pressed }) => [styles.slot, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.slotLeft}>
                    <View style={styles.slotIcon}>
                      {locked ? <Clock size={16} color="#101014" strokeWidth={1.75} /> : <SquarePen size={16} color="#101014" strokeWidth={1.75} />}
                    </View>
                    <View>
                      <Text style={[type.meta, { color: color.ink }]}>{p.title}</Text>
                      <Text style={[type.meta, { paddingTop: 2 }]}>{relativeSlot(p.scheduledFor!)}</Text>
                    </View>
                  </View>
                  <Badge tone={locked ? "white" : "dark"}>{status}</Badge>
                </Pressable>
            );
          })}
        </View>
        <View style={styles.footRule}>
          <Pressable accessibilityRole="link" onPress={() => router.push("/posts/calendar")} style={styles.link}>
            <Text style={type.label}>{t("today.viewCalendar")}</Text>
            <ArrowRight size={16} color={color.ink} strokeWidth={1.75} />
          </Pressable>
        </View>
      </View> : null}
    </PostsScreen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space[16], padding: space[16], borderWidth: 1, borderColor: color.divider },
  approval: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: radius.card,
    shadowColor: "#242038",
    shadowOpacity: 0.03,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 7 },
  },
  agenda: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  eyebrow: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 },
  photo: { height: 174, borderRadius: radius.control, overflow: "hidden", backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space[12],
    backgroundColor: "#F8F9FD",
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.7)",
    borderRadius: radius.control,
  },
  slotLeft: { flexDirection: "row", alignItems: "center", gap: space[12], flexShrink: 1 },
  slotIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center", backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  footRule: { marginTop: space[16], borderTopWidth: 1, borderTopColor: "rgba(232,231,237,0.6)", paddingTop: space[12] },
  link: { flexDirection: "row", alignItems: "center", gap: space[4], minHeight: 44, alignSelf: "flex-start" },
});
