import { router, useLocalSearchParams } from "expo-router";
import type { MediaSize } from "@/api/endpoints";
import type { Picked } from "@/ui/stories/picker";

/**
 * The story frame that Generate was opened for: the result screens offer Use in story for it. `base` is the story
 * version the trip started from (the one the pre-leave save made): the result is pinned to it, so a teammate's save in
 * the meantime makes the editor's Save stale instead of being overwritten. Absent on a deep link that doesn't carry it.
 */
export type StoryReturn = { id: string; frame: number; base?: number };

/** Every finished reel is fitted to 1080×1920 (server REEL_SIZE, apps/web/server/stories/body.ts). */
export const REEL_SIZE: MediaSize = { width: 1080, height: 1920 };

/**
 * Set by the editor when it opens Photoshoot or the Reels studio. ponytail: module state, like the studio's reel id
 * (ui/reels/use-reel.ts): those flows pass no route params from screen to screen, so threading it through every one
 * would touch them all; it doesn't survive a cold start. The editor clears it whenever it is shown again or closed, so
 * it never outlives the trip. A `returnTo=story:<id>:<frame>[:<base>]` route param wins over it.
 */
let pending: StoryReturn | null = null;
export const setStoryReturn = (r: StoryReturn | null) => void (pending = r);

/** The result handed back with its preview, so the editor needn't find it in the (capped) library listing. */
let handoff: Picked | null = null;
/** The handed-back result for `source` (`<kind>:<id>`); null when it came some other way (a deep link). */
export const handoffFor = (source: string) => (handoff && `${handoff.source.kind}:${handoff.source.id}` === source ? handoff : null);
/** The editor closed: no result screen offers to go back to it, and nothing handed back is kept. */
export const clearStoryTrip = () => {
  pending = null;
  handoff = null;
};

const parse = (s: string | undefined): StoryReturn | null => {
  const m = /^story:([^:]+):(\d+)(?::(\d+))?$/.exec(s ?? "");
  return m ? { id: m[1], frame: Number(m[2]), ...(m[3] ? { base: Number(m[3]) } : {}) } : null;
};

/** On a result screen: where Use in story goes, or null when the person didn't come from a story. */
export function useStoryReturn() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  return parse(returnTo) ?? pending;
}

/**
 * Back to the editor of that story on that frame with the result picked (`source=<kind>:<id>`, and `base`); the editor
 * applies it. Its screen is keyed by story id (app/_layout.tsx), so this pops back to that story's editor if it is in
 * the stack, and otherwise replaces this screen with a fresh one: never another story's editor.
 */
export function backToStory(r: StoryReturn, picked: Picked) {
  pending = null;
  handoff = picked;
  const source = `${picked.source.kind}:${picked.source.id}`;
  router.dismissTo({ pathname: "/posts/edit-story", params: { id: r.id, frame: String(r.frame), source, ...(r.base === undefined ? {} : { base: String(r.base) }) } });
}
