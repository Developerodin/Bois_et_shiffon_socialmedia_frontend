import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarDays, Clock, Lock, TriangleAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Card } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";
import { BusinessChip, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { CardTitle, tint } from "@/ui/posts/controls";
import { BUSINESS_TZ_LABEL, POSTS, getPost, shortDate, time24 } from "@/ui/posts/sample";

const icons = {
  link: require("../../../assets/figma/posts/btn-link.svg"),
  lock: require("../../../assets/figma/posts/btn-lock-disabled.svg"),
  bookmark: require("../../../assets/figma/posts/btn-bookmark.svg"),
};

/** Until the API client reports linked accounts, every channel reads as not connected. */
const INSTAGRAM_CONNECTED = false;
const DEFAULT_SLOT = "2026-10-26T18:00:00+01:00";

/** P05 · Posts / Schedule post: destination, date & time, then schedule (locked until a channel is linked). */
export default function SchedulePost() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const post = getPost(id) ?? POSTS[0];
  const slot = post.scheduledFor ?? DEFAULT_SLOT;
  const isStory = post.channel === "INSTAGRAM_STORY";
  const back = () => (router.canGoBack() ? router.back() : router.navigate("/posts"));

  return (
    <PostsScreen header={<PageHeader title={t("schedule.title")} right={<BusinessChip />} />} contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}>
      <Card style={styles.summary}>
        <Image source={post.image} style={styles.thumb} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
            {post.title}
          </Text>
          <Text style={[type.body, { color: color.inkSecondary }]} numberOfLines={1}>
            {post.caption?.split("\n")[0]}
          </Text>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold", color: color.inkSecondary }]}>{isStory ? t("schedule.storyFormat") : t("schedule.feedFormat")}</Text>
        </View>
      </Card>

      <Card style={{ marginTop: space[12] }}>
        <View style={styles.between}>
          <CardTitle>{t("schedule.destination")}</CardTitle>
          {!INSTAGRAM_CONNECTED ? (
            <View style={styles.required}>
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold", color: color.inkSecondary }]}>{t("schedule.actionRequired")}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.warning}>
          <View style={{ flexDirection: "row", gap: space[12] }}>
            <TriangleAlert size={20} color={color.ink} strokeWidth={1.75} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("schedule.notLinked")}</Text>
              <Text style={[type.body, { paddingTop: 2 }]}>{t("schedule.notLinkedBody")}</Text>
            </View>
          </View>
          <Button label={t("schedule.connect")} variant="outline" icon={icons.link} height={44} style={{ marginTop: space[12] }} onPress={() => router.push("/business/connections")} />
        </View>
        <View style={styles.lockRow}>
          <Lock size={16} color={color.inkSecondary} strokeWidth={1.75} />
          <Text style={type.meta}>{t("schedule.locked")}</Text>
        </View>
      </Card>

      <Card style={{ marginTop: space[12] }}>
        <CardTitle>{t("schedule.timing")}</CardTitle>
        <View style={styles.pair}>
          <View style={styles.slot} accessibilityLabel={t("schedule.dateLabel", { date: shortDate(slot) })}>
            <Text style={type.meta}>{t("schedule.date")}</Text>
            <View style={styles.slotValue}>
              <CalendarDays size={16} color={color.ink} strokeWidth={1.75} />
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{shortDate(slot)}</Text>
            </View>
          </View>
          <View style={styles.slot} accessibilityLabel={t("schedule.timeLabel", { time: time24(slot) })}>
            <Text style={type.meta}>{t("schedule.time")}</Text>
            <View style={styles.slotValue}>
              <Clock size={16} color={color.ink} strokeWidth={1.75} />
              <Text style={[type.meta, { color: color.ink }]}>{time24(slot)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.tz}>
          <Text style={[type.meta, { color: color.ink }]}>{t("schedule.timezone")}</Text>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{BUSINESS_TZ_LABEL}</Text>
        </View>
      </Card>

      <View style={{ paddingTop: space[20], gap: space[8] }}>
        <Button
          label={INSTAGRAM_CONNECTED ? t("schedule.schedulePost") : t("schedule.scheduleLocked")}
          icon={INSTAGRAM_CONNECTED ? undefined : icons.lock}
          disabled={!INSTAGRAM_CONNECTED}
          onPress={() => router.navigate("/posts/calendar")}
        />
        <Button label={t("schedule.saveDraft")} variant="outline" icon={icons.bookmark} onPress={back} />
      </View>
    </PostsScreen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[12] },
  thumb: { width: 56, height: 56, borderRadius: radius.control, backgroundColor: tint.hair },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  required: { paddingVertical: 2, paddingHorizontal: space[8], backgroundColor: tint.badge, borderWidth: 1, borderColor: color.divider, borderRadius: radius.badge },
  warning: {
    marginTop: space[8],
    padding: space[12],
    backgroundColor: "rgba(240,239,244,0.5)",
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.8)",
    borderRadius: radius.control,
  },
  lockRow: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[16], paddingBottom: space[4] },
  pair: { flexDirection: "row", gap: space[16], paddingTop: space[12] },
  slot: { flex: 1, padding: space[12], backgroundColor: "rgba(250,250,250,0.5)", borderWidth: 1, borderColor: "#E5E5E5", borderRadius: radius.control },
  slotValue: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: 2 },
  tz: {
    marginTop: space[12],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space[8],
    paddingHorizontal: space[8],
    backgroundColor: tint.well,
    borderWidth: 1,
    borderColor: tint.hair,
    borderRadius: radius.control,
  },
});
