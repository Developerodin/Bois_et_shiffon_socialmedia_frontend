import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { stories, type DueStory, type StoryItem, type StoryTab } from "@/api/endpoints";
import { storyError } from "@/ui/stories/errors";

/** What a P07 card draws. writing: the agent hasn't saved a version yet (the "Writing…" card). */
export type StoryCard = Pick<StoryItem, "id" | "title" | "status" | "tab" | "scheduledFor" | "byHand" | "firstFrameUrl" | "publishIssue"> & {
  writing: boolean;
  frames: number;
};

const asCard = (s: StoryItem): StoryCard => ({
  id: s.id,
  title: s.title,
  status: s.status,
  tab: s.tab,
  scheduledFor: s.scheduledFor,
  byHand: s.byHand,
  firstFrameUrl: s.firstFrameUrl,
  publishIssue: s.publishIssue,
  // A writer that failed leaves the story BLOCKED (Fix it on its detail screen); anything else without a version is still being written.
  writing: !s.latest && s.status !== "BLOCKED" && s.status !== "REJECTED",
  frames: s.latest?.body.frames.length ?? 0,
});

/** A story's own screen (the story detail; posting by hand starts there). */
export const openStory = (id: string) => router.push(`/posts/story/${encodeURIComponent(id)}` as Href);

const POLL_MS = 5_000;
const EMPTY: Record<StoryTab, StoryCard[]> = { drafts: [], scheduled: [], posted: [] };

/**
 * The business's stories by P07 tab (the server's `tab`), and the ones due to be posted by hand. Read when the screen
 * comes into focus, and every 5 s while a story is being written so its draft shows up when it lands.
 * Due stories need publish.execute; without it (or if they can't load) the list is just empty.
 */
export function useStories() {
  const [items, setItems] = useState<StoryCard[] | null>(null);
  const [due, setDue] = useState<DueStory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);

  const refresh = useCallback(async () => {
    const [list, dueList] = await Promise.all([
      stories.list().then(
        (r) => r.map(asCard),
        (e: unknown) => (live.current && setError(storyError(e)), null),
      ),
      stories.due().catch(() => [] as DueStory[]),
    ]);
    if (!live.current) return;
    if (list) {
      setItems(list);
      setError(null);
    }
    setDue(dueList);
  }, []);

  useFocusEffect(useCallback(() => void refresh(), [refresh]));
  const writing = items?.some((s) => s.writing) ?? false;
  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [writing, refresh]);

  const tabs = items ? { drafts: items.filter((s) => s.tab === "drafts"), scheduled: items.filter((s) => s.tab === "scheduled"), posted: items.filter((s) => s.tab === "posted") } : EMPTY;
  return { tabs, due, loading: items === null && !error, error: items ? null : error, refresh };
}
