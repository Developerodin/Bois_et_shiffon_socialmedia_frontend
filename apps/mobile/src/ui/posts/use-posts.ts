import { router, useFocusEffect } from "expo-router";
import { useCallback, useSyncExternalStore } from "react";
import { posts, type PostItem } from "@/api/endpoints";
import type { Post } from "@/ui/posts/format";
import { openReel } from "@/ui/reels/use-reel";
import { openStory } from "@/ui/stories/use-stories";

/**
 * The business's posts (calendar items), shared by every Posts screen: one list in module state, re-read when a
 * Posts screen comes into focus, so an approval or edit on one screen shows on the others.
 * ponytail: the whole 200-item list each time; page by month if calendars get bigger than that.
 */
type State = { items: PostItem[] | null; error: string | null };
let state: State = { items: null, error: null };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

let inflight: Promise<void> | null = null;
let generation = 0;
export function reloadPosts() {
  const mine = generation;
  inflight ??= posts
    .list()
    .then(
      (r) => void (mine === generation && set({ items: r.items, error: null })),
      (e: unknown) => void (mine === generation && set({ ...state, error: e instanceof Error ? e.message : String(e) })),
    )
    .finally(() => void (inflight = null));
  return inflight;
}

/** Signing out: the next Posts screen loads the new account's list; a reload still in flight is dropped. */
export const forgetPosts = () => {
  generation++;
  inflight = null;
  set({ items: null, error: null });
};

const isStory = (p: Pick<PostItem, "channel">) => p.channel === "INSTAGRAM_STORY";
// The posts without stories, worked out once per list so screens get the same array until the list changes.
let postsOnly: { from: PostItem[] | null; items: PostItem[] | null } = { from: null, items: null };
const withoutStories = (items: PostItem[] | null) => {
  if (postsOnly.from !== items) postsOnly = { from: items, items: items && items.filter((p) => !isStory(p)) };
  return postsOnly.items;
};

/**
 * `items`: the posts, without stories (stories have their own screens, P07 and the story detail). `all`: posts and
 * stories, for the calendar and Today's agenda (openPost opens a story's own screen).
 */
export function usePosts() {
  const s = useSyncExternalStore(subscribe, () => state);
  useFocusEffect(useCallback(() => void reloadPosts(), []));
  return { items: withoutStories(s.items), all: s.items, error: s.error, loading: s.items === null && !s.error, reload: reloadPosts };
}

export const usePost = (id: string | undefined) => {
  const s = usePosts();
  return { ...s, post: s.items?.find((p) => p.id === id) ?? null };
};

/** Caption with its hashtags, as the post will read. */
export const fullCaption = (p: PostItem) => {
  const b = p.latest?.body;
  return b && !isStory(p) ? [b.caption, b.hashtags.join(" ")].filter(Boolean).join("\n\n") : "";
};

/** The cover photo (the first of the post's pictures). */
export const coverUrl = (p: PostItem) => (isStory(p) ? (p.firstFrameUrl ?? null) : (p.latest?.photoUrls[0] ?? null));
/** For expo-image: cached by the photo's storage key, since the signed link changes on every read. */
export const coverSource = (p: PostItem) => {
  const uri = coverUrl(p);
  return uri ? { uri, cacheKey: isStory(p) ? undefined : p.latest?.body.photoKeys?.[0] } : undefined;
};

/** The shape the Posts rows and cards draw (shared with the sample stories). */
export const asPost = (p: PostItem): Post => {
  return { id: p.id, title: p.title, channel: p.channel, status: p.status, scheduledFor: p.scheduledFor, caption: fullCaption(p), image: coverSource(p) };
};

/** Opens a post; studio reels live in the Reels module, stories on their own screen. */
export function openPost(p: Pick<PostItem, "id" | "studio" | "channel">) {
  if (isStory(p)) return openStory(p.id);
  if (!p.studio) return router.push(`/posts/${p.id}`);
  openReel(p.id);
  router.push("/reels/review");
}
