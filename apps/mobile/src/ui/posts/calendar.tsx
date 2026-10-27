import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { longDay, monthYear, weekday, weekdayHeads } from "@/ui/posts/sample";

const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Monday-first month grid (Figma "October 2026 calendar"): 7 equal columns of 44-tall day buttons,
 * spill-over days from the neighbouring months in muted ink, a dot under days that have posts.
 */
export function MonthCalendar({
  year,
  month,
  selected,
  counts,
  scheduled,
  onSelect,
  onMonth,
}: {
  year: number;
  month: number;
  selected: string;
  /** posts per "YYYY-MM-DD" */
  counts: Record<string, number>;
  scheduled: number;
  onSelect: (day: string) => void;
  onMonth: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation("posts");
  const title = monthYear(year, month);
  const lead = (weekday(year, month, 1) + 6) % 7;
  const total = daysIn(year, month);
  const prevTotal = daysIn(year, month - 1 || 12);
  const cells: { y: number; m: number; d: number; out: boolean }[] = [];
  for (let i = lead; i > 0; i--) cells.push({ y: month === 1 ? year - 1 : year, m: month === 1 ? 12 : month - 1, d: prevTotal - i + 1, out: true });
  for (let d = 1; d <= total; d++) cells.push({ y: year, m: month, d, out: false });
  for (let d = 1; cells.length % 7; d++) cells.push({ y: month === 12 ? year + 1 : year, m: month === 12 ? 1 : month + 1, d, out: true });

  return (
    <View>
      <View style={styles.head}>
        <View style={styles.row8}>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{title}</Text>
          <View style={styles.count}>
            <Text style={[type.label, { fontFamily: "Inter_400Regular", lineHeight: 18 }]}>{t("calendar.scheduled", { count: scheduled })}</Text>
          </View>
        </View>
        <View style={[styles.row8, { gap: space[4] }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("calendar.previousMonth")} onPress={() => onMonth(-1)} style={styles.nav}>
            <ChevronLeft size={16} color={color.ink} strokeWidth={1.75} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t("calendar.nextMonth")} onPress={() => onMonth(1)} style={styles.nav}>
            <ChevronRight size={16} color={color.ink} strokeWidth={1.75} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.week, { paddingTop: space[12] }]}>
        {weekdayHeads().map((d, i) => (
          <Text key={i} style={[type.meta, styles.cell, { height: 18 }]}>
            {d}
          </Text>
        ))}
      </View>

      <View style={[styles.week, { paddingTop: space[8], flexWrap: "wrap" }]} accessibilityLabel={t("calendar.gridLabel", { month: title })}>
        {cells.map((c) => {
          const k = key(c.y, c.m, c.d);
          const n = counts[k] ?? 0;
          const on = k === selected;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={n ? t("calendar.dayWithPosts", { day: longDay(c.y, c.m, c.d), count: n }) : longDay(c.y, c.m, c.d)}
              onPress={() => onSelect(k)}
              style={[styles.day, on && styles.dayOn]}
            >
              <Text style={[styles.dayText, c.out && { color: "#71697E" }, on && styles.dayTextOn]}>{c.d}</Text>
              {n ? <View style={[styles.dot, { backgroundColor: on ? color.onPrimary : "#64646F" }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row8: { flexDirection: "row", alignItems: "center", gap: space[8] },
  count: { paddingVertical: 2, paddingHorizontal: space[8], backgroundColor: "#F5F5F5", borderRadius: radius.badge },
  nav: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  week: { flexDirection: "row" },
  cell: { width: `${100 / 7}%`, textAlign: "center" },
  day: { width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  dayOn: { backgroundColor: color.primary },
  dayText: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20, color: color.ink, textAlign: "center" },
  dayTextOn: { fontFamily: "Inter_600SemiBold", color: color.onPrimary },
  dot: { position: "absolute", top: 35, width: 4, height: 4, borderRadius: 2 },
});
