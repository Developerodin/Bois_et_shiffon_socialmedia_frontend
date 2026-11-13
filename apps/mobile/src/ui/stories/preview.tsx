import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { font } from "@/theme/tokens";
import { headlineSize, TEXT_BOX } from "@/ui/stories/limits";
import { useCurrentBrand } from "@/ui/use-current-brand";

type Props = {
  frame: { label: string; headline: string; body: string };
  isLast: boolean;
  cta: string;
  brandMark: boolean;
  /** The Text tool is open: show the safe-area guide (250 px top and bottom of 1920 stay clear). */
  editing: boolean;
  /** The frame's rendered picture, if it has one. */
  url: string | null;
  /** The rendered picture already shows this text, CTA and brand mark; otherwise the text is drawn over it. */
  fresh: boolean;
  /** Preview width; the height is 16/9 of it. */
  width: number;
  accessibilityLabel: string;
};

/**
 * One story frame as a true 9:16 preview. While the rendered frame matches the edits it is shown as is; after a change
 * the text is drawn live over it (dimmed, since the old text is burned into the picture) with TEXT_BOX's layout scaled
 * down, so the person sees roughly where it lands. The server redraws the frame on save.
 */
export function StoryPreview({ frame, isLast, cta, brandMark, editing, url, fresh, width, accessibilityLabel }: Props) {
  const brand = useCurrentBrand();
  const s = width / TEXT_BOX.frame.width;
  const t = TEXT_BOX;
  const live = !fresh || !url;
  const top = brandMark && brand?.logoUrl ? Math.max(t.textTop, t.safe.top + t.brandMark.height + t.gaps.brandMarkToText) : t.textTop;
  const headline = headlineSize(frame.headline) ?? t.headline.minSize;
  const text = (size: number, semibold: boolean) => ({ fontFamily: semibold ? font.semibold : font.regular, fontSize: size * s, lineHeight: size * s * t.lineHeight, color: "#FFFFFF", textAlign: "center" as const });

  return (
    <View style={[styles.frame, { width, height: (width * 16) / 9 }]} accessible accessibilityLabel={accessibilityLabel}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      {live ? (
        <>
          {url ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.7)" }]} /> : null}
          {/* The renderer's fixed gradient (render.ts GRADIENT). */}
          <LinearGradient
            colors={["rgba(0,0,0,0.66)", "rgba(0,0,0,0.5)", "rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,0,0,0.62)"]}
            locations={[0, 0.4, 0.6, 0.72, 1]}
            style={StyleSheet.absoluteFill}
          />
          {brandMark && brand?.logoUrl ? (
            <View style={[styles.mark, { top: t.safe.top * s, height: t.brandMark.height * s, paddingHorizontal: 24 * s, borderRadius: 22 * s }]}>
              <Image source={{ uri: brand.logoUrl }} style={{ width: t.brandMark.logoWidth * s, height: t.brandMark.logoHeight * s }} contentFit="contain" />
            </View>
          ) : null}
          <View style={[styles.column, { top: top * s, width: t.width * s, left: ((t.frame.width - t.width) / 2) * s }]}>
            {frame.label.trim() ? (
              <View style={{ backgroundColor: "rgba(255,255,255,0.24)", borderRadius: 14 * s, paddingHorizontal: t.label.padX * s, paddingVertical: t.label.padY * s, marginBottom: t.gaps.labelToHeadline * s }}>
                <Text style={text(t.label.size, true)}>{frame.label.trim().toUpperCase()}</Text>
              </View>
            ) : null}
            {frame.headline.trim() ? <Text style={[text(headline, true), { marginBottom: t.gaps.headlineToBody * s }]}>{frame.headline.trim()}</Text> : null}
            {frame.body.trim() ? <Text style={text(t.body.size, false)}>{frame.body.trim()}</Text> : null}
          </View>
          {isLast && cta.trim() ? (
            <View style={[styles.cta, { bottom: t.safe.bottom * s, maxWidth: t.width * s, paddingHorizontal: t.cta.padX * s, paddingVertical: t.cta.padY * s, borderRadius: 48 * s }]}>
              <Text style={[text(t.cta.size, true), { color: "#111111" }]}>{cta.trim()}</Text>
            </View>
          ) : null}
        </>
      ) : null}
      {editing ? (
        <>
          <View pointerEvents="none" style={[styles.guide, { top: 0, height: t.safe.top * s, borderBottomWidth: 1 }]} />
          <View pointerEvents="none" style={[styles.guide, { bottom: 0, height: t.safe.bottom * s, borderTopWidth: 1 }]} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: "#1F1B26" },
  mark: { position: "absolute", alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  column: { position: "absolute", alignItems: "center" },
  cta: { position: "absolute", alignSelf: "center", backgroundColor: "#FFFFFF" },
  guide: { position: "absolute", left: 0, right: 0, backgroundColor: "rgba(91,80,214,0.18)", borderColor: "rgba(255,255,255,0.7)", borderStyle: "dashed" },
});
