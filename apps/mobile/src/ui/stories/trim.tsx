import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import { color, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { type Crop, placed, type Size } from "@/ui/stories/crop";

/** A story clip plays this long from `start` (render.ts reads the same window). */
export const CLIP_SECONDS = 15;
export type Clip = { start: number; sound: boolean };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const tenths = (s: number) => Math.round(s * 10) / 10;
/** The latest start that still leaves 15 s; 0 means the clip is 15 s or shorter and plays whole. */
const lastStart = (duration: number) => Math.max(0, Math.floor((duration - CLIP_SECONDS) * 10) / 10);

/**
 * The clip itself on the preview while the Image tool is open: its chosen 15 s on a loop, silent when its sound is
 * off, placed by its crop. Reports the clip's length and picture size once it loads (the trim and crop need them).
 */
export function ClipPicture({ url, clip, crop, width, size, onLoad }: { url: string; clip: Clip; crop?: Crop; width: number; size?: Size; onLoad: (m: { duration: number; size?: Size }) => void }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  // expo-video is driven by setting the player's properties; the React Compiler's immutability rule can't know that.
  /* eslint-disable react-hooks/immutability */
  useEventListener(player, "sourceLoad", (e) => {
    const track = e.availableVideoTracks[0]?.size;
    onLoad({ duration: e.duration, size: track && track.width > 0 && track.height > 0 ? { width: track.width, height: track.height } : undefined });
    player.currentTime = clip.start;
  });
  useEffect(() => {
    player.muted = !clip.sound;
  }, [player, clip.sound]);
  useEffect(() => {
    player.currentTime = clip.start;
  }, [player, clip.start]);
  // Back to the start of the window when it ends (or when the loop wraps to 0 before it).
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (currentTime >= clip.start + CLIP_SECONDS || currentTime < clip.start - 0.5) player.currentTime = clip.start;
  });
  /* eslint-enable react-hooks/immutability */
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]}>
      <VideoView player={player} style={size ? placed(size, crop, width) : StyleSheet.absoluteFill} contentFit={size ? "fill" : "cover"} nativeControls={false} />
    </View>
  );
}

/**
 * Which 15 s of a longer clip the story plays: drag the window along the clip, or step it a second at a time (the
 * buttons and the screen reader's adjust actions do the same). A clip of 15 s or less plays whole.
 */
export function Trim({ duration, start, onChange }: { duration: number | null; start: number; onChange: (start: number) => void }) {
  const { t } = useTranslation("posts");
  const [track, setTrack] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const cur = useRef<number | null>(null);
  const max = duration === null ? 0 : lastStart(duration);
  const at = Math.min(live ?? start, max);
  const set = (v: number) => onChange(tenths(Math.min(max, Math.max(0, v))));
  const drag = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-4, 4],
    onUpdate: (e) => {
      if (!track || duration === null) return;
      const next = Math.min(max, Math.max(0, (cur.current ?? at) + (e.changeX / track) * duration));
      cur.current = next;
      setLive(next);
    },
    onFinalize: () => {
      if (cur.current !== null) set(cur.current);
      cur.current = null;
      setLive(null);
    },
  });
  if (duration === null) return <Text style={type.meta}>{t("stories.trim.loading")}</Text>;
  if (max === 0) return <Text style={type.meta}>{t("stories.trim.whole", { length: mmss(duration) })}</Text>;
  const range = t("stories.trim.range", { from: mmss(at), to: mmss(at + CLIP_SECONDS), length: mmss(duration) });

  return (
    <View style={{ gap: space[8] }}>
      <Text style={type.body}>{range}</Text>
      <GestureHandlerRootView>
        <View style={styles.track} onLayout={(e) => setTrack(e.nativeEvent.layout.width)}>
          <GestureDetector gesture={drag}>
            <View
              collapsable={false}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={t("stories.trim.window")}
              accessibilityValue={{ text: range }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(e) => set(at + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
              hitSlop={{ top: 8, bottom: 8 }}
              style={[styles.window, { left: (at / duration) * track, width: (CLIP_SECONDS / duration) * track }]}
            />
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
      <View style={{ flexDirection: "row", gap: space[8] }}>
        <Button label={t("stories.trim.earlier")} accessibilityLabel={t("stories.trim.earlierLabel")} variant="outline" height={44} style={{ flex: 1 }} disabled={at <= 0} onPress={() => set(at - 1)} />
        <Button label={t("stories.trim.later")} accessibilityLabel={t("stories.trim.laterLabel")} variant="outline" height={44} style={{ flex: 1 }} disabled={at >= max} onPress={() => set(at + 1)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 40, borderRadius: radius.control, backgroundColor: color.controlOutline, overflow: "hidden" },
  window: { position: "absolute", top: 0, bottom: 0, borderRadius: radius.control, borderWidth: 3, borderColor: color.primary, backgroundColor: "rgba(91,80,214,0.25)" },
});
