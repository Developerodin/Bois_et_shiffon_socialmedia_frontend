import { Image } from "expo-image";
import { ArrowLeft, ArrowRight, Ellipsis, Plus, Trash2, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { Sheet } from "@/ui/recovery/sheet";
import { STORY_LIMITS } from "@/ui/stories/limits";

type StripFrame = { url: string | null; kind: "photo" | "video" | null; headline: string };

const W = 45;

/**
 * The editor's frame strip: tap a thumbnail to switch frames; its "…" button opens the frame's menu (`onMenu`, shown
 * with <FrameMenu>), the button alternative to dragging. + adds a frame, up to 5; without `onAdd` it shows but is off
 * (the picker comes in its own task).
 */
export function FrameStrip({
  frames,
  selected,
  onSelect,
  onAdd,
  onMenu,
  disabled,
}: {
  frames: StripFrame[];
  selected: number;
  onSelect: (i: number) => void;
  onAdd?: () => void;
  onMenu: (i: number) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("posts");
  const canAdd = !!onAdd && !disabled && frames.length < STORY_LIMITS.maxFrames;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {frames.map((f, i) => (
        <View key={i} style={styles.item}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: i === selected }}
            accessibilityLabel={frameLabel(t, f, i, frames.length)}
            onPress={() => onSelect(i)}
            style={[styles.thumb, i === selected && styles.thumbOn]}
          >
            {f.url ? <Image source={{ uri: f.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.n}>{i + 1}</Text>}
          </Pressable>
          {/* A 20 px badge in the thumbnail's corner on a 36 px target inside the thumbnail (Android doesn't hit-test
              slop past the parent's edges), plus hitSlop on the inner sides. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("stories.editor.frameOptions", { n: i + 1 })}
            hitSlop={{ left: 8, bottom: 8 }}
            disabled={disabled}
            onPress={() => onMenu(i)}
            style={styles.more}
          >
            <View style={styles.badge}>
              <Ellipsis size={12} color={color.onPrimary} strokeWidth={2} />
            </View>
          </Pressable>
        </View>
      ))}
      {frames.length < STORY_LIMITS.maxFrames ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("stories.editor.addFrame")} accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} onPress={onAdd} style={[styles.thumb, styles.add, !canAdd && { opacity: 0.4 }]}>
          <Plus size={18} color={color.onPrimary} strokeWidth={1.75} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

type T = ReturnType<typeof useTranslation<"posts">>["t"];
/** "Frame 2 of 4, video: <headline>", without the headline part when it's empty. */
export const frameLabel = (t: T, f: StripFrame, i: number, total: number) =>
  f.headline.trim()
    ? t(f.kind === "video" ? "stories.detail.frameLabelVideo" : "stories.detail.frameLabel", { n: i + 1, total, headline: f.headline })
    : t(f.kind === "video" ? "stories.editor.frameLabelVideoEmpty" : "stories.editor.frameLabelEmpty", { n: i + 1, total });

/**
 * A frame's menu as a bottom sheet: Move left, Move right (only where the frame can go) and Remove frame. A row runs
 * its action and closes the sheet; the scrim and back close it. Render it last in the screen's full-screen container.
 */
export function FrameMenu({ index, frames, onClose, onMove, onRemove }: { index: number | null; frames: StripFrame[]; onClose: () => void; onMove: (i: number, dir: -1 | 1) => void; onRemove: (i: number) => void }) {
  const { t } = useTranslation("posts");
  const i = index ?? 0;
  const f = frames[i] as StripFrame | undefined;
  const run = (act: () => void) => () => {
    onClose();
    act();
  };
  const rows: { key: string; label: string; Icon: LucideIcon; danger?: boolean; onPress: () => void }[] = [
    ...(i > 0 ? [{ key: "left", label: t("stories.editor.moveLeft"), Icon: ArrowLeft, onPress: run(() => onMove(i, -1)) }] : []),
    ...(i < frames.length - 1 ? [{ key: "right", label: t("stories.editor.moveRight"), Icon: ArrowRight, onPress: run(() => onMove(i, 1)) }] : []),
    { key: "remove", label: t("stories.editor.remove"), Icon: Trash2, danger: true, onPress: run(() => onRemove(i)) },
  ];
  return (
    <Sheet visible={index !== null && !!f} onClose={onClose} label={t("stories.editor.frameN", { n: i + 1 })} scrim="rgba(10,10,12,0.6)" gutter={space[20]}>
      {f ? (
        <View style={styles.menuHead} accessible accessibilityLabel={frameLabel(t, f, i, frames.length)}>
          <View style={styles.menuThumb}>{f.url ? <Image source={{ uri: f.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={[styles.n, { color: color.ink }]}>{i + 1}</Text>}</View>
          <Text style={[type.cardTitle, { fontFamily: "Inter_600SemiBold" }]}>{t("stories.editor.frameN", { n: i + 1 })}</Text>
        </View>
      ) : null}
      {rows.map(({ key, label, Icon, danger, onPress }) => (
        <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: color.canvas }]}>
          <Icon size={20} color={danger ? color.error : color.ink} strokeWidth={1.75} />
          <Text style={[type.label, danger && { color: color.error }]}>{label}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { gap: space[12], paddingHorizontal: space[16], paddingVertical: space[4], alignItems: "center" },
  item: { position: "relative" },
  thumb: { width: W, height: (W * 16) / 9, borderRadius: radius.badge, overflow: "hidden", backgroundColor: "#2A2533", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  thumbOn: { borderWidth: 2, borderColor: color.onPrimary },
  n: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: color.onPrimary },
  more: { position: "absolute", top: 0, right: 0, width: 36, height: 36, padding: 3, alignItems: "flex-end" },
  badge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  add: { borderStyle: "dashed" },
  menuHead: { flexDirection: "row", alignItems: "center", gap: space[12], paddingBottom: space[12] },
  menuThumb: { width: 27, height: 48, borderRadius: 6, overflow: "hidden", backgroundColor: color.divider, alignItems: "center", justifyContent: "center" },
  menuRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: space[12], paddingHorizontal: space[4], borderRadius: radius.nested },
});
