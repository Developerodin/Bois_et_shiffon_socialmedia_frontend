import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { CalendarDays, Clock, Lock, TriangleAlert } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { PageLoading } from "@/ui/page-loading";
import { connections, postRelease, posts, stories, type Connection, type PostRelease, type StoryBody, type StoryRelease } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Card } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";
import { MonthCalendar } from "@/ui/posts/calendar";
import { BusinessChip, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { CardTitle, Pill, tint } from "@/ui/posts/controls";
import { BUSINESS_TZ_LABEL, dayKey, shortDate, time24, ymd } from "@/ui/posts/format";
import { coverSource, reloadPosts, usePosts } from "@/ui/posts/use-posts";
import { openReel } from "@/ui/reels/use-reel";
import { storyError } from "@/ui/stories/errors";

const icons = {
  link: require("../../../assets/figma/posts/btn-link.svg"),
  lock: require("../../../assets/figma/posts/btn-lock-disabled.svg"),
  bookmark: require("../../../assets/figma/posts/btn-bookmark.svg"),
};

/** Half-hour slots from 07:00 to 22:30, in the phone's timezone. */
const TIMES = Array.from({ length: 32 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const MIN_LEAD_MS = 5 * 60_000;

/** The post's planned slot when it's still ahead, else tomorrow at 18:00. */
function firstSlot(planned: string | null, now: number) {
  if (planned && new Date(planned).getTime() > now + MIN_LEAD_MS) return new Date(planned);
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

/**
 * P05 · Posts / Schedule post: destination, date & time, then schedule (locked until a channel is linked).
 * An approved story also offers Post by hand: at the picked time or now (a reminder, no account needed), change that
 * time, or stop it. Scheduling a story that was set to be posted by hand clears that on the server.
 */
export default function SchedulePost() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Posts and stories (usePost leaves stories out).
  const { all } = usePosts();
  const post = all?.find((p) => p.id === id) ?? null;
  const [release, setRelease] = useState<PostRelease | null>(null);
  const [linked, setLinked] = useState<Connection[]>([]);
  const [slot, setSlot] = useState<Date | null>(null);
  const [open, setOpen] = useState<"date" | "time" | null>(null);
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [board, setBoard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // When the screen opened; the server refuses a slot that has passed by the time Schedule is tapped.
  const [now] = useState(Date.now);
  const [error, setError] = useState<string | null>(null);
  // The release read failed (not a scheduling error): the destination card offers a retry instead of spinning.
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Stories: Schedule or Post by hand; null = not picked yet (Post by hand when it is already set to that).
  const [mode, setMode] = useState<"schedule" | "byHand" | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.navigate("/posts"));

  // Read again on every focus: coming back from X03 Reconnect (or Connections) unlocks Schedule.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      const ctrl = new AbortController();
      setLoadError(false);
      postRelease(id, ctrl.signal).then(
        (r) => {
          setRelease(r);
          // Only when no account can post: is one linked but signed out?
          if (r.accounts.length === 0) connections().then((c) => !ctrl.signal.aborted && setLinked(c.connections), () => {});
        },
        () => !ctrl.signal.aborted && setLoadError(true),
      );
      return () => ctrl.abort();
    }, [id, attempt]), // eslint-disable-line react-hooks/exhaustive-deps -- Try again bumps attempt
  );

  if (!post || !post.latest) {
    return (
      <PostsScreen header={<PageHeader title={t("schedule.title")} right={<BusinessChip />} />} contentStyle={{ padding: space[16] }}>
        <PageLoading photo />
      </PostsScreen>
    );
  }
  const at = slot ?? firstSlot(post.scheduledFor, now);
  const view = month ?? ymd(at);
  const accounts = release?.accounts ?? [];
  const connectionId = account ?? accounts[0]?.id ?? null;
  const boards = connectionId ? release?.boards[connectionId] : undefined;
  const boardId = board ?? boards?.[0]?.id ?? null;
  const connected = accounts.length > 0;
  // Linked but its sign-in expired: X03 reconnects it instead of starting over from Connections. X03 signs in to
  // Instagram and Facebook (the app's consent flow); other networks reconnect from Connections.
  const provider = release?.requirements.provider;
  const expired = !connected && linked.some((c) => c.provider === provider && c.status === "ERROR");
  const inApp = provider === "INSTAGRAM" || provider === "META";
  const needsBoard = !!release?.requirements.needsBoard;
  const future = at.getTime() > now + MIN_LEAD_MS;
  // What the server would refuse, said before the tap: image count for the channel, and Instagram's JPEG-only rule.
  const keys = post.latest.body.photoKeys ?? [];
  const req = release?.requirements;
  const imageProblem = !req
    ? null
    : post.channel === "INSTAGRAM_REEL"
      ? t("schedule.reelInStudio")
    : keys.length < req.minImages
      ? t("schedule.needImages", { count: req.minImages })
      : keys.length > req.maxImages
        ? t("schedule.tooManyImages", { count: req.maxImages })
        : req.provider === "INSTAGRAM" && keys.some((k) => !/\.jpe?g$/i.test(k))
          ? t("schedule.jpegOnly")
          : null;
  const canSchedule = !!release && !!connectionId && future && !imageProblem && (!needsBoard || !!boardId) && !busy;
  const isCarousel = post.channel === "INSTAGRAM_CAROUSEL";
  const isStory = post.channel === "INSTAGRAM_STORY";
  const storyBody = isStory ? (post.latest.body as unknown as StoryBody) : null;
  const byHandOn = !!release && "byHand" in release && (release as StoryRelease).byHand;
  const how = isStory ? (mode ?? (byHandOn ? "byHand" : "schedule")) : "schedule";

  const pickDay = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const next = new Date(at);
    next.setFullYear(y, m - 1, d);
    setSlot(next);
    setOpen(null);
  };
  const pickTime = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const next = new Date(at);
    next.setHours(h, m, 0, 0);
    setSlot(next);
    setOpen(null);
  };
  const schedule = async () => {
    if (!connectionId || !post.latest) return;
    setBusy(true);
    setError(null);
    try {
      await posts.schedule(post.id, post.latest.version, { connectionId, runAt: at, approve: post.status === "AWAITING_APPROVAL", photoKeys: keys, boardId: boardId ?? undefined });
      await reloadPosts();
      if (isStory) back();
      else router.navigate("/posts/calendar");
    } catch (e) {
      setError(isStory ? storyError(e) : e instanceof Error ? e.message : String(e));
      void reloadPosts(); // the approval may have gone through before the scheduling failed
    } finally {
      setBusy(false);
    }
  };
  // Post by hand at `when` (null: stop posting by hand); the story detail shows the rest.
  const byHand = async (when: Date | null) => {
    setBusy(true);
    setError(null);
    try {
      await stories.byHand(post.id, when);
      await reloadPosts();
      back();
    } catch (e) {
      setError(storyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PostsScreen header={<PageHeader title={t("schedule.title")} right={<BusinessChip />} />} contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}>
      <Card style={styles.summary}>
        <Image source={coverSource(post)} style={styles.thumb} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
            {post.title}
          </Text>
          <Text style={[type.body, { color: color.inkSecondary }]} numberOfLines={1}>
            {storyBody ? (storyBody.frames[0]?.headline ?? "") : post.latest.body.caption.split("\n")[0]}
          </Text>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold", color: color.inkSecondary }]}>
            {storyBody ? t("stories.scheduling.storyFormat", { count: storyBody.frames.length }) : isCarousel ? t("schedule.carouselFormat") : t("schedule.feedFormat")}
          </Text>
        </View>
      </Card>

      {isStory ? (
        <Card style={{ marginTop: space[12] }}>
          <CardTitle>{t("stories.scheduling.how")}</CardTitle>
          <View style={[styles.chips, { paddingTop: space[8] }]} accessibilityRole="radiogroup">
            <Pill label={t("stories.scheduling.modeSchedule")} selected={how === "schedule"} onPress={() => setMode("schedule")} />
            <Pill label={t("stories.scheduling.modeByHand")} selected={how === "byHand"} onPress={() => setMode("byHand")} />
          </View>
          <Text style={[type.meta, { paddingTop: space[8] }]}>
            {how === "byHand" ? t("stories.scheduling.byHandBody") : storyBody?.link ? t("stories.scheduling.noLinkScheduled") : t("stories.scheduling.scheduleBody")}
          </Text>
          {byHandOn && post.scheduledFor ? (
            <Text style={[type.label, { fontFamily: "Inter_600SemiBold", paddingTop: space[8] }]}>
              {t("stories.scheduling.byHandSet", { date: shortDate(post.scheduledFor), time: time24(post.scheduledFor) })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {how === "schedule" ? (
      <Card style={{ marginTop: space[12] }}>
        <View style={styles.between}>
          <CardTitle>{t("schedule.destination")}</CardTitle>
          {release && !connected ? (
            <View style={styles.required}>
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold", color: color.inkSecondary }]}>{t("schedule.actionRequired")}</Text>
            </View>
          ) : null}
        </View>
        {!release && loadError ? (
          <View style={{ paddingTop: space[8], gap: space[8] }}>
            <Text style={[type.meta, { color: color.error }]}>{t("schedule.loadFailed")}</Text>
            <Button label={t("schedule.retry")} variant="outline" height={44} onPress={() => setAttempt((n) => n + 1)} />
          </View>
        ) : !release ? (
          <ActivityIndicator color={color.primary} style={{ marginTop: space[12] }} />
        ) : connected ? (
          <View style={{ paddingTop: space[8], gap: space[8] }}>
            <View style={styles.chips}>
              {accounts.map((a) => (
                <Pill key={a.id} label={a.displayName} selected={a.id === connectionId} onPress={() => setAccount(a.id)} />
              ))}
            </View>
            {needsBoard ? (
              boards ? (
                <View style={styles.chips}>
                  {boards.map((b) => (
                    <Pill key={b.id} label={b.name} selected={b.id === boardId} onPress={() => setBoard(b.id)} />
                  ))}
                </View>
              ) : (
                <Text style={type.meta}>{t("schedule.boardsFailed")}</Text>
              )
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.warning}>
              <View style={{ flexDirection: "row", gap: space[12] }}>
                <TriangleAlert size={20} color={color.ink} strokeWidth={1.75} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>
                    {t(expired ? "schedule.expired" : "schedule.notLinked", { channel: release.requirements.provider ? t(`schedule.provider.${release.requirements.provider}`) : "" })}
                  </Text>
                  <Text style={[type.body, { paddingTop: 2 }]}>{t("schedule.notLinkedBody")}</Text>
                </View>
              </View>
              <Button
                label={expired ? t("schedule.reconnect", { channel: t(`schedule.provider.${provider}`) }) : t("schedule.connect")}
                variant="outline"
                icon={icons.link}
                height={44}
                style={{ marginTop: space[12] }}
                onPress={() =>
                  expired && inApp ? router.push({ pathname: "/recovery/reconnect", params: { id: post.id, provider: provider ?? "" } }) : router.push("/business/connections")
                }
              />
            </View>
            <View style={styles.lockRow}>
              <Lock size={16} color={color.inkSecondary} strokeWidth={1.75} />
              <Text style={type.meta}>{t("schedule.locked")}</Text>
            </View>
          </>
        )}
      </Card>
      ) : null}

      <Card style={{ marginTop: space[12] }}>
        <CardTitle>{t("schedule.timing")}</CardTitle>
        <View style={styles.pair}>
          <Pressable style={[styles.slot, open === "date" && styles.slotOn]} accessibilityRole="button" accessibilityLabel={t("schedule.dateLabel", { date: shortDate(at.toISOString()) })} onPress={() => setOpen(open === "date" ? null : "date")}>
            <Text style={type.meta}>{t("schedule.date")}</Text>
            <View style={styles.slotValue}>
              <CalendarDays size={16} color={color.ink} strokeWidth={1.75} />
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{shortDate(at.toISOString())}</Text>
            </View>
          </Pressable>
          <Pressable style={[styles.slot, open === "time" && styles.slotOn]} accessibilityRole="button" accessibilityLabel={t("schedule.timeLabel", { time: time24(at.toISOString()) })} onPress={() => setOpen(open === "time" ? null : "time")}>
            <Text style={type.meta}>{t("schedule.time")}</Text>
            <View style={styles.slotValue}>
              <Clock size={16} color={color.ink} strokeWidth={1.75} />
              <Text style={[type.meta, { color: color.ink }]}>{time24(at.toISOString())}</Text>
            </View>
          </Pressable>
        </View>
        {open === "date" ? (
          <View style={{ paddingTop: space[12] }}>
            <MonthCalendar
              year={view.y}
              month={view.m}
              selected={dayKey(at)}
              counts={{}}
              scheduled={0}
              onSelect={pickDay}
              onMonth={(delta) => setMonth(view.m + delta < 1 ? { y: view.y - 1, m: 12 } : view.m + delta > 12 ? { y: view.y + 1, m: 1 } : { y: view.y, m: view.m + delta })}
            />
          </View>
        ) : null}
        {open === "time" ? (
          <View style={[styles.chips, { paddingTop: space[12] }]}>
            {TIMES.map((hhmm) => (
              <Pill key={hhmm} label={hhmm} selected={hhmm === time24(at.toISOString())} onPress={() => pickTime(hhmm)} />
            ))}
          </View>
        ) : null}
        {!future ? <Text style={[type.meta, { color: color.error, paddingTop: space[8] }]}>{t("schedule.past", { count: MIN_LEAD_MS / 60_000 })}</Text> : null}
        <View style={styles.tz}>
          <Text style={[type.meta, { color: color.ink }]}>{t("schedule.timezone")}</Text>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{BUSINESS_TZ_LABEL}</Text>
        </View>
      </Card>

      <View style={{ paddingTop: space[20], gap: space[8] }}>
        {imageProblem ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              if (post.channel !== "INSTAGRAM_REEL") return router.push({ pathname: "/posts/edit", params: { id: post.id } });
              openReel(post.id);
              router.push("/reels/review");
            }}
          >
            <Text style={[type.meta, { color: color.error, textAlign: "center" }]}>{imageProblem}</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={[type.meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
        {how === "byHand" && !release && loadError ? (
          <>
            <Text style={[type.meta, { color: color.error, textAlign: "center" }]}>{t("schedule.loadFailed")}</Text>
            <Button label={t("schedule.retry")} variant="outline" onPress={() => setAttempt((n) => n + 1)} />
          </>
        ) : how === "byHand" ? (
          <>
            <Button
              label={t(byHandOn ? "stories.scheduling.changeTime" : "stories.scheduling.byHandAt", { time: time24(at.toISOString()) })}
              loading={busy}
              disabled={!future || !release}
              onPress={() => void byHand(at)}
            />
            <Button label={t("stories.scheduling.byHandNow")} variant="outline" disabled={busy || !release} onPress={() => void byHand(new Date())} />
            {byHandOn ? <Button label={t("stories.scheduling.stopByHand")} variant="ghost" disabled={busy} onPress={() => void byHand(null)} /> : null}
          </>
        ) : (
          <Button
            label={busy ? t("schedule.scheduling") : connected || !release ? t(isStory ? "stories.scheduling.scheduleStory" : "schedule.schedulePost") : t("schedule.scheduleLocked")}
            icon={connected || !release ? undefined : icons.lock}
            disabled={!canSchedule}
            onPress={() => void schedule()}
          />
        )}
        <Button label={t("schedule.later")} variant="outline" icon={icons.bookmark} onPress={back} />
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  pair: { flexDirection: "row", gap: space[16], paddingTop: space[12] },
  slot: { flex: 1, padding: space[12], backgroundColor: "rgba(250,250,250,0.5)", borderWidth: 1, borderColor: "#E5E5E5", borderRadius: radius.control },
  slotOn: { borderColor: color.primary },
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
