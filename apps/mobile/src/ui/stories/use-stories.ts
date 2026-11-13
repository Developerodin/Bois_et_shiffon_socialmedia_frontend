import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { stories, type DueStory, type StoryItem, type StoryTab } from "@/api/endpoints";
import { storyError } from "@/ui/stories/errors";

/** What a P07 card draws. writing: the agent hasn't saved a version yet (the "Writing…" card). */
export type StoryCard = Pick<StoryItem, "id" | "title" | "status" | "tab" | "scheduledFor" | "byHand" | "firstFrameUrl" | "publishIssue"> & {
  writing: boolean;
  version: number | null;
};

/**
 * Written by the agent for the app's New story (its brief keeps the request id) and still without a version. Planner and
 * Brief stories also start with no version but nobody is writing them: they are plain drafts (the Add photos card).
 * ponytail: a run lost for over 10 minutes stops showing as writing and becomes a normal draft.
 */
const WRITING_MS = 10 * 60_000;
const isWriting = (s: StoryItem, now: number) => !s.latest && s.status === "BRIEF_READY" && typeof s.brief?.requestId === "string" && now - new Date(s.createdAt).getTime() < WRITING_MS;

const asCard = (s: StoryItem, now: number): StoryCard => ({
  id: s.id,
  title: s.title,
  status: s.status,
  tab: s.tab,
  scheduledFor: s.scheduledFor,
  byHand: s.byHand,
  firstFrameUrl: s.firstFrameUrl,
  publishIssue: s.publishIssue,
  writing: isWriting(s, now),
  version: s.latest?.version ?? null,
});

/** A story's own screen (the story detail; posting by hand starts there). */
export const openStory = (id: string) => router.push({ pathname: "/posts/story/[id]", params: { id } });

const POLL_MS = 5_000;
const EMPTY: Record<StoryTab, StoryCard[]> = { drafts: [], scheduled: [], posted: [] };

/**
 * The business's stories by P07 tab (the server's `tab`), and the ones due to be posted by hand. Read when the screen
 * comes into focus, and every 5 s while it's focused and a story is being written, so the draft shows up when it lands.
 * Due stories need publish.execute; without it (or if they can't load) the list is just empty.
 */
export function useStories() {
  const [items, setItems] = useState<StoryCard[] | null>(null);
  const [due, setDue] = useState<DueStory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => void (live.current = false);
  }, []);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    inflight.current = true;
    const [list, dueList] = await Promise.all([
      stories.list().then(
        (r) => r.map((s) => asCard(s, Date.now())),
        (e: unknown) => (live.current && setError(storyError(e)), null),
      ),
      stories.due().catch(() => [] as DueStory[]),
    ]);
    inflight.current = false;
    if (!live.current) return;
    if (list) {
      setItems(list);
      setError(null);
    }
    setDue(dueList);
  }, []);

  const writing = items?.some((s) => s.writing) ?? false;
  useFocusEffect(useCallback(() => void refresh(), [refresh]));
  // Only while the screen is focused; a tick is skipped while the last read is still out.
  useFocusEffect(
    useCallback(() => {
      if (!writing) return;
      const timer = setInterval(() => void (inflight.current || refresh()), POLL_MS);
      return () => clearInterval(timer);
    }, [writing, refresh]),
  );

  const tabs = items ? { drafts: items.filter((s) => s.tab === "drafts"), scheduled: items.filter((s) => s.tab === "scheduled"), posted: items.filter((s) => s.tab === "posted") } : EMPTY;
  return { tabs, due, loading: items === null && !error, error: items ? null : error, refresh };
}
