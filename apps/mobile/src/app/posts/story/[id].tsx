import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { posts, stories, type StoryBody, type StoryRelease } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Card } from "@/ui/layout";
import { PageLoading } from "@/ui/page-loading";
import { color, radius, space, type } from "@/theme/tokens";
import { BottomNav, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge } from "@/ui/posts/controls";
import { DecisionCard } from "@/ui/posts/decision-card";
import { STATUS_KEY, shortDate, time24 } from "@/ui/posts/format";
import { reloadPosts, usePosts } from "@/ui/posts/use-posts";
import { useWorkingPoll } from "@/ui/posts/use-working-poll";
import { ByHand } from "@/ui/stories/by-hand";
import { Unfinished } from "@/ui/stories/card";
import { storyCodeText, storyError } from "@/ui/stories/errors";
import { usePermissions } from "@/ui/use-permissions";

const FRAME_MAX = 300;

/**
 * The story detail (the story counterpart of posts/[id].tsx): its rendered frames to swipe through (clips play), the
 * checks with Fix it, Approve / Approve anyway / Request changes, and the way out: Schedule or Post by hand, the
 * by-hand package, cancelling a schedule, and a partly posted story's Post the rest / Mark as done / "Did frame N appear?".
 */
export default function StoryDetail() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id: string }>();
  const { all, loading, error } = usePosts();
  const story = all?.find((p) => p.id === id && p.channel === "INSTAGRAM_STORY") ?? null;
  const { can } = usePermissions();
  const [release, setRelease] = useState<StoryRelease | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"fix" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // "Fix it" was tapped on this version: the writer is on it until a newer version lands.
  const [fixing, setFixing] = useState<number | null>(null);

  const version = story?.latest?.version ?? null;
  // Only the newest read lands, and none after the screen is gone (a slow answer must not overwrite a newer one).
  const seq = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => void (live.current = false);
  }, []);
  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    const mine = ++seq.current;
    const current = () => live.current && mine === seq.current;
    return stories.get(id).then(
      (r) => void (current() && (setRelease(r), setLoadError(null))),
      (e: unknown) => void (current() && setLoadError(storyError(e))),
    );
  }, [id]);
  // The status, text and check come from the shared posts list (the item's own GET has none of them). It may predate
  // this story (a fresh link), so "not found" waits for a list read made after this screen opened.
  const [listRead, setListRead] = useState(false);
  // On every focus (the schedule screen changes the release without a new version) and on each new version.
  useFocusEffect(
    useCallback(() => {
      void load();
      void reloadPosts().then(() => live.current && setListRead(true));
    }, [load, version]), // eslint-disable-line react-hooks/exhaustive-deps -- a new version re-reads the frames
  );
  const refresh = useCallback(async () => {
    await Promise.all([reloadPosts(), load()]);
  }, [load]);

  // Being written, rendered, sent back for a rewrite, or waiting for its check: re-read every 5 s (up to 3 minutes).
  const working =
    !!release?.rendering ||
    story?.status === "BRIEF_READY" ||
    (story?.status === "DRAFT_REVIEW" && (!story.latest?.check || story.latest.review?.verdict === "CHANGES_REQUESTED" || fixing === story.latest.version));
  const { slow, retry } = useWorkingPoll(working, version ?? 0, refresh);

  if (!story) {
    const failed = loadError ?? (error ? t("stories.detail.loadFailed") : listRead && !loading ? t("stories.errors.notFound") : null);
    return (
      <PostsScreen header={<PageHeader title={t("stories.detail.title")} />} nav={<BottomNav active="stories" />} contentStyle={{ padding: space[16] }}>
        {failed ? (
          <View style={{ gap: space[8] }}>
            <Text style={type.body}>{failed}</Text>
            <Button label={t("stories.retry")} variant="outline" height={44} onPress={() => void refresh()} />
          </View>
        ) : (
          <PageLoading photo />
        )}
      </PostsScreen>
    );
  }
  const body = story.latest?.body as unknown as StoryBody | undefined;
  const check = story.latest?.check ?? null;
  const findings = (check?.results ?? []).filter((r) => r.status !== "pass");
  const blocked = !working && (story.status === "BLOCKED" || (story.status === "DRAFT_REVIEW" && check?.overall === "BLOCKER"));
  const issues = ["AWAITING_APPROVAL", "APPROVED", "SCHEDULED"].includes(story.status) ? (release?.productIssues ?? []) : [];
  const refused = issues.some((i) => i.refuses);
  const scheduled = release?.attempts.find((a) => a.status === "SCHEDULED");
  const unfinished = release?.attempts.some((a) => a.status === "PARTIAL" || a.status === "PENDING_VERIFY");
  const approved = story.status === "APPROVED" && !!release?.approvalValid;
  const byHand = approved && !!release?.byHand && !!release.scheduledFor;
  // Nothing to edit until the writer has saved a first version (a Planner story starts without one).
  // Not while it's set to be posted by hand (the server refuses: its frames may be downloaded already).
  const editable = !(story.status === "APPROVED" && release?.byHand) && version !== null && ["PLANNED", "BRIEF_READY", "DRAFT_REVIEW", "AWAITING_APPROVAL", "APPROVED", "REJECTED", "BLOCKED"].includes(story.status) && can("content.create");
  const edit = () => router.push({ pathname: "/posts/edit-story", params: { id: story.id } });
  const when = (iso: string) => ({ date: shortDate(iso), time: time24(iso) });

  const act = async (key: "fix" | "cancel", fn: () => Promise<unknown>) => {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(storyError(e));
    } finally {
      setBusy(null);
    }
  };
  const fix = () =>
    act("fix", async () => {
      await posts.rewrite(story.id, version ?? 0);
      setFixing(version ?? 0);
      retry();
    });
  // Slow: a stuck render is read again; a stuck writer or check is asked again (as on the post detail).
  const tryAgain = () => {
    if (!release?.rendering) return void fix();
    retry();
    void refresh();
  };

  return (
    <PostsScreen
      header={<PageHeader title={t("stories.detail.title")} right={<Badge style={{ borderColor: "#E5E5E5" }}>{t(STATUS_KEY[story.status])}</Badge>} />}
      nav={<BottomNav active="stories" />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
    >
      <Text style={[type.label, { fontFamily: "Inter_600SemiBold", paddingBottom: space[8] }]}>{story.title}</Text>
      {!release ? (
        loadError ? (
          <View style={{ gap: space[8] }}>
            <Text style={[type.meta, { color: color.error }]}>{loadError}</Text>
            <Button label={t("stories.retry")} variant="outline" height={44} onPress={() => void load()} />
          </View>
        ) : (
          <PageLoading photo rows={1} style={{ marginTop: 0 }} />
        )
      ) : (
        <Frames frames={release.frames} written={version !== null} />
      )}

      {release?.rendering ? (
        <Text style={[type.meta, { paddingTop: space[12] }]} accessibilityLiveRegion="polite">
          {slow ? t("detail.slow") : t("stories.detail.preparing")}
        </Text>
      ) : release?.renderError ? (
        <Card style={{ marginTop: space[12], gap: space[8] }}>
          <Text style={[styles.eyebrow, { color: color.error }]}>{t("stories.detail.renderFailed")}</Text>
          <Text style={type.body}>{storyCodeText(release.renderErrorCode, release.renderError, release.renderErrorData ?? {})}</Text>
          <Text style={type.meta}>{t("stories.detail.renderFailedBody")}</Text>
          {editable ? <Button label={t("stories.editStory")} variant="outline" height={44} onPress={edit} /> : null}
        </Card>
      ) : null}

      {body ? (
        <Card style={{ marginTop: space[12], gap: space[4] }}>
          <Text style={type.body}>{t("stories.detail.cta", { cta: body.cta })}</Text>
          <Text style={type.meta} numberOfLines={2}>
            {body.link ? t("stories.detail.link", { link: body.link }) : t("stories.detail.noLink")}
          </Text>
        </Card>
      ) : null}

      {working && !release?.rendering ? (
        <Text style={[type.meta, { paddingTop: space[12] }]} accessibilityLiveRegion="polite">
          {slow ? t("detail.slow") : t("detail.notReady")}
        </Text>
      ) : check ? (
        <Card style={{ marginTop: space[12], gap: space[8] }}>
          <Text style={styles.eyebrow}>{t("stories.detail.checks")}</Text>
          {findings.length ? (
            findings.map((r) => (
              <Text key={r.check} style={[type.body, r.status === "blocker" && { color: color.error }]}>
                {`${r.check}: ${r.note}`}
              </Text>
            ))
          ) : (
            <Text style={type.body}>{t("stories.detail.allPassed")}</Text>
          )}
          {blocked && can("content.create") ? <Button label={busy === "fix" ? t("edit.regenerating") : t("detail.fixIt")} variant="outline" height={44} disabled={busy !== null} onPress={() => void fix()} /> : null}
        </Card>
      ) : blocked && can("content.create") ? (
        <View style={{ paddingTop: space[12] }}>
          <Button label={busy === "fix" ? t("edit.regenerating") : t("detail.fixIt")} variant="outline" height={44} disabled={busy !== null} onPress={() => void fix()} />
        </View>
      ) : null}

      {slow && working ? (
        <View style={{ paddingTop: space[8] }}>
          <Button label={busy === "fix" ? t("edit.regenerating") : t("detail.tryAgain")} variant="outline" height={44} disabled={busy !== null} onPress={tryAgain} />
        </View>
      ) : null}

      {version !== null && !working ? (
        <DecisionCard id={story.id} version={version} status={story.status} issues={issues} approve={() => stories.approve(story.id, version)} onDecided={() => refresh()} errorText={storyError} />
      ) : null}
      {story.status === "AWAITING_APPROVAL" && !can("content.approve") ? <Text style={[type.meta, { paddingTop: space[12] }]}>{t("stories.detail.waitingApprover")}</Text> : null}

      {unfinished && can("publish.execute") ? (
        <View style={{ paddingTop: space[12] }}>
          <Unfinished story={story} onChanged={() => void refresh()} />
        </View>
      ) : null}

      {scheduled ? (
        <Card style={{ marginTop: space[12], gap: space[8] }}>
          <Text style={type.body}>{t("stories.detail.scheduledFor", when(scheduled.runAt))}</Text>
          {can("publish.execute") ? (
            <Button
              label={busy === "cancel" ? t("detail.cancelling") : t("detail.cancelSchedule")}
              variant="outline"
              height={44}
              disabled={busy !== null}
              onPress={() => void act("cancel", () => posts.settle(story.id, scheduled.id, "cancel"))}
            />
          ) : null}
        </Card>
      ) : approved && !refused ? (
        can("publish.execute") ? (
          <>
            {byHand ? <Text style={[type.label, { fontFamily: "Inter_600SemiBold", paddingTop: space[16] }]}>{t("stories.detail.byHandDue", when(release.scheduledFor!))}</Text> : null}
            <View style={{ gap: space[8], paddingTop: space[16] }}>
              <Button
                label={byHand ? t("stories.detail.changeTime") : t("stories.detail.goOut")}
                variant={byHand ? "outline" : "primary"}
                onPress={() => router.push({ pathname: "/posts/schedule", params: { id: story.id } })}
              />
              {editable ? <Button label={t("stories.editStory")} variant="outline" onPress={edit} /> : null}
            </View>
            {byHand ? (
              <ByHand
                id={story.id}
                title={story.title}
                frames={body?.frames.length ?? 0}
                link={body?.link ?? ""}
                onPosted={() => {
                  void reloadPosts();
                  router.navigate({ pathname: "/posts/stories", params: { tab: "posted" } });
                }}
              />
            ) : null}
          </>
        ) : (
          <Text style={[type.meta, { paddingTop: space[16] }]}>{t("stories.detail.noPublish")}</Text>
        )
      ) : editable && !working ? (
        <View style={styles.actions}>
          <Button label={t("stories.editStory")} variant="outline" style={{ flex: 1 }} onPress={edit} />
        </View>
      ) : null}
      {story.status === "PUBLISHED" ? <Text style={[type.meta, { paddingTop: space[16] }]}>{t("stories.detail.posted")}</Text> : null}
      {actionError ? <Text style={[type.meta, { color: color.error, paddingTop: space[12] }]}>{actionError}</Text> : null}
    </PostsScreen>
  );
}

/** The rendered frames, one 9:16 page each: swipe through them; the visible clip plays (muted, looping). */
function Frames({ frames, written }: { frames: StoryRelease["frames"]; written: boolean }) {
  const { t } = useTranslation("posts");
  // At most 300 wide (533 tall), so the checks and actions start on the first screen.
  const [width, setWidth] = useState(0);
  const [rawPage, setPage] = useState(0);
  // Clamped: a new version may have fewer frames than the page the person was on.
  const page = Math.min(rawPage, Math.max(frames.length - 1, 0));
  if (!frames.length) {
    return (
      <View style={[styles.frame, styles.empty, { width: FRAME_MAX, alignSelf: "center" }]}>
        <Text style={[type.meta, { textAlign: "center", paddingHorizontal: space[16] }]}>{t(written ? "stories.detail.noFrames" : "stories.detail.notWritten")}</Text>
      </View>
    );
  }
  return (
    <View onLayout={(e) => setWidth(Math.min(e.nativeEvent.layout.width, FRAME_MAX))}>
      {width ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ width, alignSelf: "center", borderRadius: radius.control }}
        >
          {frames.map((f, i) => (
            <View
              key={f.n}
              style={[styles.frame, { width }]}
              accessible
              accessibilityLabel={t(f.kind === "video" ? "stories.detail.frameLabelVideo" : "stories.detail.frameLabel", { n: f.n, total: frames.length, headline: f.headline })}
            >
              {!f.url ? null : f.kind === "video" ? <Clip url={f.url} active={i === page} /> : <Image source={{ uri: f.url }} style={StyleSheet.absoluteFill} contentFit="cover" />}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.frame, { width: FRAME_MAX, alignSelf: "center" }]} />
      )}
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {frames.map((f, i) => (
          <View key={f.n} style={[styles.dot, i === page && { backgroundColor: color.ink }]} />
        ))}
        <Text style={[type.meta, { marginLeft: space[8] }]}>{t("stories.detail.frameCount", { n: page + 1, total: frames.length })}</Text>
      </View>
    </View>
  );
}

/** Every clip frame gets its own player and they all load at once; a story has at most 5 frames. */
function Clip({ url, active }: { url: string; active: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  eyebrow: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 },
  frame: { aspectRatio: 9 / 16, overflow: "hidden", backgroundColor: "#F5F5F5" },
  empty: { borderRadius: radius.control, borderWidth: 1, borderColor: "#E5E5E5", alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: space[8] },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#D4D4D8" },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[16] },
});
