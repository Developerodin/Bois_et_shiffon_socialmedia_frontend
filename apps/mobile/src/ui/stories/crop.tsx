import { Image } from "expo-image";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures } from "react-native-gesture-handler";
import { space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { TEXT_BOX } from "@/ui/stories/limits";

export type Crop = { x: number; y: number; scale: number };
export type Size = { width: number; height: number };

const W = TEXT_BOX.frame.width;
const H = TEXT_BOX.frame.height;
const MAX_SCALE = 4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const norm = (crop?: Crop): Crop => ({ x: clamp(crop?.x ?? 0.5, 0, 1), y: clamp(crop?.y ?? 0.5, 0, 1), scale: clamp(crop?.scale ?? 1, 0.1, MAX_SCALE) });
const cover = (src: Size) => Math.max(W / src.width, H / src.height);

/**
 * The renderer's crop, line for line (`cropWindow` in apps/web/server/stories/render.ts, whose doc comment is the
 * contract): the window cut from the source, the size it's scaled to and where it sits on the black 1080×1920 frame.
 * Change both together, or the preview stops matching the rendered frame.
 */
export function cropWindow(srcW: number, srcH: number, crop?: Crop) {
  const c = norm(crop);
  const s = cover({ width: srcW, height: srcH }) * c.scale;
  const width = clamp(Math.round(Math.min(srcW, W / s)), 1, srcW);
  const height = clamp(Math.round(Math.min(srcH, H / s)), 1, srcH);
  const even = (v: number, max: number) => clamp(2 * Math.round((v * s) / 2), 2, max);
  const outWidth = even(width, W);
  const outHeight = even(height, H);
  return {
    left: Math.floor(clamp(c.x * srcW - width / 2, 0, srcW - width)),
    top: Math.floor(clamp(c.y * srcH - height / 2, 0, srcH - height)),
    width,
    height,
    outWidth,
    outHeight,
    dx: (W - outWidth) / 2,
    dy: (H - outHeight) / 2,
  };
}

/** Fit: the whole source shows, with black bars on the sides it doesn't reach. Fill is scale 1. */
export const fitScale = (src: Size) => Math.min(W / src.width, H / src.height) / cover(src);

// A 1920×1080 source at Fit keeps its whole width, 608 px tall and centred: worked out by hand from render.ts.
if (__DEV__) {
  const b = cropWindow(1920, 1080, { x: 0.5, y: 0.5, scale: fitScale({ width: 1920, height: 1080 }) });
  console.assert(b.width === 1920 && b.height === 1080 && b.outWidth === 1080 && b.outHeight === 608 && b.dy === 656, "crop.tsx cropWindow no longer matches render.ts");
}

/** Where the whole source sits on the frame for this crop, in preview points (`width` is the preview's); the frame clips it. */
export function placed(src: Size, crop: Crop | undefined, width: number) {
  const b = cropWindow(src.width, src.height, crop);
  const k = width / W;
  const kx = b.outWidth / b.width;
  const ky = b.outHeight / b.height;
  return { position: "absolute" as const, left: (b.dx - b.left * kx) * k, top: (b.dy - b.top * ky) * k, width: src.width * kx * k, height: src.height * ky * k };
}

/** x and y only where they move the picture (a side with nothing to spare stays centred), so a drag past an edge doesn't stick. */
function clampCrop(src: Size, crop: Crop): Crop {
  const c = norm(crop);
  const s = cover(src) * c.scale;
  const half = (frame: number, side: number) => Math.min(1, frame / s / side) / 2;
  const hx = half(W, src.width);
  const hy = half(H, src.height);
  return { scale: c.scale, x: hx >= 0.5 ? 0.5 : clamp(c.x, hx, 1 - hx), y: hy >= 0.5 ? 0.5 : clamp(c.y, hy, 1 - hy) };
}

/** A frame's photo (or a clip's first picture) placed by its crop on black; it reports the source's size once loaded. */
export function CropImage({ uri, crop, width, size, onSize }: { uri: string; crop?: Crop; width: number; size?: Size; onSize: (s: Size) => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, size && { backgroundColor: "#000" }]}>
      <Image
        source={{ uri }}
        contentFit={size ? "fill" : "cover"}
        style={size ? placed(size, crop, width) : StyleSheet.absoluteFill}
        onLoad={(e) => onSize({ width: e.source.width, height: e.source.height })}
      />
    </View>
  );
}

/**
 * Drag and pinch over the preview while the Image tool is open, once the source's size is known (`src`). The picture
 * follows the fingers (`children` gets the crop to draw); the editor gets one change when the fingers lift. Pinching
 * stops at Fit and at 4× Fill.
 */
export function CropArea({ src, crop, width, onChange, children }: { src?: Size; crop?: Crop; width: number; onChange: (c: Crop) => void; children: (crop?: Crop) => ReactNode }) {
  const [live, setLive] = useState<Crop | null>(null);
  const cur = useRef<Crop | null>(null);
  const move = (f: (c: Crop, src: Size) => Crop) => {
    if (!src) return;
    const next = clampCrop(src, f(cur.current ?? norm(crop), src));
    cur.current = next;
    setLive(next);
  };
  const end = () => {
    if (cur.current) onChange(cur.current);
    cur.current = null;
    setLive(null);
  };
  // Points on the preview → a share of the source's width or height, at the current zoom.
  const k = width / W;
  const pan = usePanGesture({
    runOnJS: true,
    enabled: !!src,
    onUpdate: (e) => move((c, s) => ({ ...c, x: c.x - e.changeX / k / (cover(s) * c.scale) / s.width, y: c.y - e.changeY / k / (cover(s) * c.scale) / s.height })),
    onFinalize: end,
  });
  const pinch = usePinchGesture({
    runOnJS: true,
    enabled: !!src,
    onUpdate: (e) => move((c, s) => ({ ...c, scale: clamp(c.scale * e.scaleChange, fitScale(s), MAX_SCALE) })),
    onFinalize: end,
  });
  const both = useSimultaneousGestures(pan, pinch);

  return (
    <GestureHandlerRootView style={{ width, height: (width * 16) / 9 }}>
      <GestureDetector gesture={both}>
        <View collapsable={false}>{children(live ?? crop)}</View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/** Fit and Fill, the buttons that do what the fingers do; reel frames keep their framing (their AI label sits in it). */
export function CropControls({ size, crop, locked, onChange }: { size?: Size; crop?: Crop; locked: boolean; onChange: (c: Crop | undefined) => void }) {
  const { t } = useTranslation("posts");
  if (locked) return <Text style={type.meta}>{t("stories.crop.locked")}</Text>;
  const scale = crop?.scale ?? 1;
  const fit = size ? fitScale(size) : null;
  return (
    <View style={{ gap: space[8] }}>
      <Text style={type.meta}>{t("stories.crop.hint")}</Text>
      <View style={{ flexDirection: "row", gap: space[8] }}>
        <Button
          label={t("stories.crop.fit")}
          accessibilityLabel={t("stories.crop.fitLabel")}
          variant={fit !== null && Math.abs(scale - fit) < 0.001 ? "primary" : "outline"}
          height={44}
          style={{ flex: 1 }}
          disabled={fit === null}
          onPress={() => fit !== null && onChange({ x: 0.5, y: 0.5, scale: fit })}
        />
        <Button
          label={t("stories.crop.fill")}
          accessibilityLabel={t("stories.crop.fillLabel")}
          variant={Math.abs(scale - 1) < 0.001 ? "primary" : "outline"}
          height={44}
          style={{ flex: 1 }}
          onPress={() => onChange(crop ? { x: crop.x, y: crop.y, scale: 1 } : undefined)}
        />
      </View>
    </View>
  );
}
