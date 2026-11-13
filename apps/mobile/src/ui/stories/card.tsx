import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ellipsis, ImagePlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { stories, type StoryAttempt } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { color, radius, space, type } from "@/theme/tokens";
import { STATUS_KEY, relativeSlot } from "@/ui/posts/format";
import { storyError } from "@/ui/stories/errors";
import { openStory, type StoryCard as Card } from "@/ui/stories/use-stories";
import { usePermissions } from "@/ui/use-permissions";

/** The card's badge: what the story is waiting for, short enough for one line over the frame. */
function useStatusLine(s: Card) {
  const { t } = useTranslation("posts");
  if (s.writing) return t("stories.writing");
  // When it goes out is under the title (the badge is too narrow for it).
  if (s.tab === "scheduled") return t(s.byHand ? "stories.byHand" : "status.scheduled");
  // Posted but not finished: an attempt went out in part, or one frame's outcome is unknown.
  if (s.tab === "posted" && s.status === "SCHEDULED") return t(s.publishIssue === "CHECK" ? "stories.needsCheck" : "stories.partlyPosted");
  // The shared "Waiting for approval" doesn't fit the badge on one line.
  return s.status === "AWAITING_APPROVAL" ? t("stories.toApprove") : t(STATUS_KEY[s.status]);
}

/**
 * One P07 story card: the first rendered frame (or an "Add photos" placeholder), its status, and a "…" menu with
 * Duplicate (and Delete on drafts). A posted story that isn't finished shows what's left to do under it.
 */
export function StoryCard({ story, onChanged }: { story: Card; onChanged: () => void }) {
  const { t } = useTranslation("posts");
  const { can } = usePermissions();
  const line = useStatusLine(story);
  const when = story.tab === "scheduled" && story.scheduledFor ? relativeSlot(story.scheduledFor) : null;
  const [busy, setBusy] = useState(false);

  const run = async (act: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await act();
      onChanged();
    } catch (e) {
      Alert.alert(t("stories.failed"), storyError(e));
    } finally {
      setBusy(false);
    }
  };
  const menu = () =>
    Alert.alert(story.title, undefined, [
      { text: t("stories.duplicate"), onPress: () => void run(() => stories.duplicate(story.id)) },
      ...(story.tab === "drafts"
        ? [
            {
              text: t("stories.delete"),
              style: "destructive" as const,
              onPress: () =>
                Alert.alert(t("stories.deleteTitle"), t("stories.deleteBody"), [
                  { text: t("stories.cancel"), style: "cancel" },
                  { text: t("stories.delete"), style: "destructive", onPress: () => void run(() => stories.remove(story.id)) },
                ]),
            },
          ]
        : []),
      { text: t("stories.cancel"), style: "cancel" },
    ]);

  return (
    <View style={{ flex: 1, gap: space[8] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("stories.cardLabel", { title: story.title, status: when ? `${line}, ${when}` : line })}
        disabled={story.writing}
        onPress={() => openStory(story.id)}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      >
        {story.firstFrameUrl ? (
          <Image source={{ uri: story.firstFrameUrl, cacheKey: `story-${story.id}-v${story.version}` }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            {story.writing ? <ActivityIndicator color={color.primary} /> : <ImagePlus size={24} color={color.inkSecondary} strokeWidth={1.75} />}
            {story.writing ? null : <Text style={[type.meta, { color: color.ink }]}>{t("stories.addPhotos")}</Text>}
          </View>
        )}
        <LinearGradient colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0)", "rgba(0,0,0,0.8)"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.top}>
          <View style={styles.status}>
            <Text style={styles.statusText} numberOfLines={1}>
              {line}
            </Text>
          </View>
          {story.writing || !can("content.create") ? null : (
            <Pressable accessibilityRole="button" accessibilityLabel={t("stories.moreOptions", { title: story.title })} hitSlop={10} disabled={busy} onPress={menu} style={styles.more}>
              {busy ? <ActivityIndicator size="small" color={color.onPrimary} /> : <Ellipsis size={16} color={color.onPrimary} strokeWidth={1.75} />}
            </Pressable>
          )}
        </View>
        <View style={styles.bottom}>
          <Text style={styles.title} numberOfLines={2}>
            {story.title}
          </Text>
          {when ? <Text style={styles.when}>{when}</Text> : null}
        </View>
      </Pressable>
      {story.tab === "posted" && story.status === "SCHEDULED" && can("publish.execute") ? <Unfinished story={story} onChanged={onChanged} /> : null}
    </View>
  );
}

/** A partly posted story (Post the rest / Mark as done) or one whose frame may not have appeared ("Did frame 3 appear?"). */
function Unfinished({ story, onChanged }: { story: Card; onChanged: () => void }) {
  const { t } = useTranslation("posts");
  const [attempts, setAttempts] = useState<StoryAttempt[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the server says the posted frames expired: the next tap confirms.
  const [expiredOk, setExpiredOk] = useState(false);
  useEffect(() => {
    let live = true;
    stories.get(story.id).then(
      (r) => live && setAttempts(r.attempts),
      (e: unknown) => live && setError(storyError(e)),
    );
    return () => void (live = false);
  }, [story.id, story.status, story.publishIssue]);

  const act = async (key: string, call: () => Promise<{ attempts: StoryAttempt[] }>) => {
    setPending(key);
    setError(null);
    try {
      setAttempts((await call()).attempts);
      setExpiredOk(false);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.code === "story.expiredConfirm") setExpiredOk(true);
      setError(storyError(e));
    } finally {
      setPending(null);
    }
  };
  // Marking done closes off "Post the rest" for good, so it asks first.
  const markDone = (attemptId: string) =>
    Alert.alert(t("stories.markDoneTitle"), t("stories.markDoneBody"), [
      { text: t("stories.cancel"), style: "cancel" },
      { text: t("stories.markDone"), style: "destructive", onPress: () => void act("done", () => stories.markDone(story.id, attemptId)) },
    ]);

  if (!attempts) return error ? <Text style={[type.meta, { color: color.error }]}>{error}</Text> : <ActivityIndicator color={color.primary} />;
  const partial = attempts.find((a) => a.status === "PARTIAL" && a.frames !== undefined);
  const unsure = attempts.find((a) => a.status === "PENDING_VERIFY" && a.frames !== undefined);
  const posted = (a: StoryAttempt) => a.progress?.filter((f) => f.state === "published").length ?? 0;
  return (
    <View style={{ gap: space[8] }}>
      {partial ? (
        <>
          <Text style={type.meta}>{t("stories.framesPosted", { posted: posted(partial), total: partial.frames })}</Text>
          <Button
            label={t(expiredOk ? "stories.postRestAnyway" : "stories.postRest")}
            height={44}
            loading={pending === "rest"}
            disabled={pending !== null}
            onPress={() => void act("rest", () => stories.postRest(story.id, partial.id, expiredOk))}
          />
          <Button label={t("stories.markDone")} variant="outline" height={44} loading={pending === "done"} disabled={pending !== null} onPress={() => markDone(partial.id)} />
        </>
      ) : null}
      {unsure?.progress
        ?.filter((f) => f.state === "publishing")
        .map((f) => (
          <View key={f.i} style={{ gap: space[8] }}>
            <Text style={[type.meta, { color: color.ink }]}>{t("stories.didFrameAppear", { n: f.i + 1 })}</Text>
            <View style={{ flexDirection: "row", gap: space[8] }}>
              <Button label={t("stories.yes")} variant="outline" height={44} style={{ flex: 1 }} disabled={pending !== null} onPress={() => void act(`yes${f.i}`, () => stories.settleFrame(story.id, unsure.id, f.i, true))} />
              <Button label={t("stories.no")} variant="outline" height={44} style={{ flex: 1 }} disabled={pending !== null} onPress={() => void act(`no${f.i}`, () => stories.settleFrame(story.id, unsure.id, f.i, false))} />
            </View>
          </View>
        ))}
      {error ? <Text style={[type.meta, { color: color.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { aspectRatio: 167 / 297, borderRadius: radius.control, overflow: "hidden", backgroundColor: "#F5F5F5", borderWidth: 1, borderColor: "#E5E5E5" },
  placeholder: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: space[8] },
  top: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  status: { flexShrink: 1, paddingVertical: 2, paddingHorizontal: space[8], borderRadius: radius.badge, backgroundColor: "#211D2A" },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 20, color: color.onPrimary },
  more: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: radius.badge, backgroundColor: "rgba(0,0,0,0.4)" },
  bottom: { position: "absolute", left: 12, right: 12, bottom: 12, padding: space[8] },
  when: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, color: color.onPrimary },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 20,
    color: color.onPrimary,
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
