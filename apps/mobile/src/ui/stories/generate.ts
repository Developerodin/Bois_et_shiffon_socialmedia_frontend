import { router, useLocalSearchParams } from "expo-router";
import type { SourceRef } from "@/api/endpoints";

/** The story frame that Generate was opened for: the result screens offer Use in story for it. */
export type StoryReturn = { id: string; frame: number };

/**
 * Set by the editor when it opens Photoshoot or the Reels studio. ponytail: module state, like the studio's reel id
 * (ui/reels/use-reel.ts): those flows pass no route params from screen to screen, so threading it through every one
 * would touch them all; it doesn't survive a cold start. The editor clears it whenever it is shown again, so it never
 * outlives the trip. A `returnTo=story:<id>:<frame>` route param wins over it.
 */
let pending: StoryReturn | null = null;
export const setStoryReturn = (r: StoryReturn | null) => void (pending = r);

const parse = (s: string | undefined): StoryReturn | null => {
  const m = /^story:([^:]+):(\d+)$/.exec(s ?? "");
  return m ? { id: m[1], frame: Number(m[2]) } : null;
};

/** On a result screen: where Use in story goes, or null when the person didn't come from a story. */
export function useStoryReturn() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  return parse(returnTo) ?? pending;
}

/**
 * Back to the editor on that frame with the result picked (`source=<kind>:<id>`); the editor applies it. The editor is
 * usually lower in the stack, so the screens above it close; from a deep link it replaces this screen.
 */
export function backToStory(r: StoryReturn, source: SourceRef) {
  pending = null;
  router.dismissTo({ pathname: "/posts/edit-story", params: { id: r.id, frame: String(r.frame), source: `${source.kind}:${source.id}` } });
}
