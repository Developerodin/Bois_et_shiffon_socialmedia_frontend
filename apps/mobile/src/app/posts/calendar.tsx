import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/ui/layout";
import { color, space, type } from "@/theme/tokens";
import { MonthCalendar } from "@/ui/posts/calendar";
import { BottomNav, BusinessSwitcher, ModuleHeader, PostsScreen } from "@/ui/posts/chrome";
import { PostRow, SegmentedTabs } from "@/ui/posts/controls";
import { POSTS, TODAY, dayKey, isLockedIn, longDay, monthYear, postsOnDay, ymd } from "@/ui/posts/sample";

const VIEWS = ["month", "list"] as const;

/** P02 · Posts / Calendar: month grid with a dot per posting day, then the selected day's posts. */
export default function PostsCalendar() {
  const { t } = useTranslation("posts");
  const today = ymd(TODAY);
  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState({ y: today.y, m: today.m });
  const [selected, setSelected] = useState(dayKey(TODAY));

  const { counts, scheduled } = useMemo(() => {
    const counts: Record<string, number> = {};
    let scheduled = 0;
    const prefix = `${cursor.y}-${String(cursor.m).padStart(2, "0")}`;
    for (const p of POSTS) {
      if (!p.scheduledFor) continue;
      const k = dayKey(new Date(p.scheduledFor));
      counts[k] = (counts[k] ?? 0) + 1;
      if (k.startsWith(prefix) && isLockedIn(p.status)) scheduled++;
    }
    return { counts, scheduled };
  }, [cursor]);

  const [sy, sm, sd] = selected.split("-").map(Number);
  // List view: every dated post of the month, in order. Month view: the selected day only.
  const prefix = `${cursor.y}-${String(cursor.m).padStart(2, "0")}`;
  const list =
    view === "month"
      ? postsOnDay(selected)
      : POSTS.filter((p) => p.scheduledFor && dayKey(new Date(p.scheduledFor)).startsWith(prefix)).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));

  const shift = (delta: -1 | 1) =>
    setCursor(({ y, m }) => {
      const n = m + delta;
      return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n };
    });

  return (
    <PostsScreen header={<ModuleHeader />} nav={<BottomNav active="posts" />}>
      <BusinessSwitcher />
      <View style={styles.titleRow}>
        <View style={{ flexShrink: 1 }}>
          <Text style={type.pageTitle} accessibilityRole="header">
            {t("calendar.title")}
          </Text>
          <Text style={type.meta}>{t("calendar.subtitle")}</Text>
        </View>
        <SegmentedTabs label={t("calendar.viewLabel")} options={VIEWS.map((value) => ({ value, label: t(`calendar.views.${value}`) }))} value={view} onChange={setView} />
      </View>

      {view === "month" ? (
        <Card style={{ marginTop: space[24] }}>
          <MonthCalendar year={cursor.y} month={cursor.m} selected={selected} counts={counts} scheduled={scheduled} onSelect={setSelected} onMonth={shift} />
          <View style={styles.planRow}>
            <Text style={type.meta}>{t("calendar.plan", { n: 30 })}</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push("/posts/planner")} style={styles.link}>
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("calendar.managePlan")}</Text>
              <ArrowRight size={16} color={color.ink} strokeWidth={1.75} />
            </Pressable>
          </View>
        </Card>
      ) : null}

      <View style={styles.dayHead}>
        <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]} accessibilityRole="header">
          {view === "month" ? longDay(sy, sm, sd) : monthYear(cursor.y, cursor.m)}
        </Text>
        <Text style={type.meta}>{t("calendar.postCount", { count: list.length })}</Text>
      </View>
      <View style={{ paddingTop: space[12], gap: space[8] }}>
        {list.length ? (
          list.map((p) => <PostRow key={p.id} post={p} onPress={() => router.push(`/posts/${p.id}`)} />)
        ) : (
          <Text style={[type.meta, { paddingVertical: space[16], textAlign: "center" }]}>{t("calendar.empty")}</Text>
        )}
      </View>
    </PostsScreen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space[24], gap: space[12] },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space[12],
    paddingTop: space[12],
    borderTopWidth: 1,
    borderTopColor: "#F5F5F5",
  },
  link: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44 },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space[24] },
});
