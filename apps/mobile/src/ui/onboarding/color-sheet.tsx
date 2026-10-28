import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { saveBrandColors } from "@/ui/onboarding/use-brand-assets";
import { color, radius, space, type } from "@/theme/tokens";

/** `7c6754`, `#abc` → `#7C6754` / `#AABBCC`; null when it isn't a hex colour. Same rule as the server. */
export function normalizeHex(raw: string) {
  const v = raw.trim().replace(/^#/, "").toUpperCase();
  if (!/^([0-9A-F]{3}|[0-9A-F]{6})$/.test(v)) return null;
  return `#${v.length === 3 ? [...v].map((c) => c + c).join("") : v}`;
}

const hslToHex = (h: number, s: number, l: number) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [(h + 360) % 360, s * 100, l * 100];
}

/** Same colour, `step` points lighter (+) or darker (−), within 4–96%; already past the limit → unchanged (never the opposite way). */
export function shade(hex: string, step: number) {
  const [h, s, l] = hexToHsl(hex);
  const next = Math.min(96, Math.max(4, l + step));
  return (step > 0 && next <= l) || (step < 0 && next >= l) ? hex : hslToHex(h, s, next);
}

// Picker: pick a named colour, then one of its five shades. Muted saturation, so every pick looks like a
// brand colour, not a neon. Names: onboarding:brand.hues.<key>; shades: onboarding:brand.shades.<key>.
const HUES = [
  { key: "red", h: 0, s: 55 },
  { key: "orange", h: 25, s: 60 },
  { key: "yellow", h: 45, s: 60 },
  { key: "green", h: 95, s: 35 },
  { key: "teal", h: 170, s: 40 },
  { key: "blue", h: 210, s: 50 },
  { key: "purple", h: 265, s: 40 },
  { key: "pink", h: 325, s: 45 },
  { key: "brown", h: 25, s: 30 },
  { key: "grey", h: 0, s: 0 },
];
const SHADES = [
  { key: "lightest", l: 85 },
  { key: "light", l: 68 },
  { key: "medium", l: 50 },
  { key: "dark", l: 34 },
  { key: "darkest", l: 20 },
];

/** The picker colour closest in hue to `hex` (greys and browns by saturation), so it opens where you are. */
function nearestHue(hex: string | null) {
  if (!hex) return 0;
  const [h, s] = hexToHsl(hex);
  if (s < 10) return HUES.length - 1;
  const dist = (a: number) => Math.min(Math.abs(a - h), 360 - Math.abs(a - h));
  let best = 0;
  HUES.forEach((c, i) => {
    if (c.s > 0 && dist(c.h) + Math.abs(c.s - s) / 4 < dist(HUES[best].h) + Math.abs(HUES[best].s - s) / 4) best = i;
  });
  return best;
}

/**
 * A10 palette editor: change, remove or add one colour (`index: "new"`). Saves the whole palette; Research
 * keeps people's colours from then on. Stays open with a message if saving fails, so nothing is lost silently.
 */
export function ColorSheet({ colors, index, onClose }: { colors: string[]; index: number | "new" | null; onClose: () => void }) {
  const { t } = useTranslation("onboarding");
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  // While a save is in flight the sheet stays put: its late onClose must not close a sheet opened after it.
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal visible={index !== null} transparent animationType="slide" onRequestClose={close}>
      {/* "padding" on Android too: the app is edge-to-edge, so the window doesn't resize for the keyboard */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={styles.scrim} onPress={close} accessibilityLabel={t("common:close")} />
        <View style={[styles.sheet, { paddingBottom: space[24] + insets.bottom }]}>
          <View style={styles.grabber} />
          {/* keyed: a fresh editor (and starting value) for each swatch opened */}
          {index !== null ? <Editor key={String(index)} colors={colors} index={index} onClose={onClose} onBusy={setBusy} /> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Editor({ colors, index, onClose, onBusy }: { colors: string[]; index: number | "new"; onClose: () => void; onBusy: (busy: boolean) => void }) {
  const { t } = useTranslation("onboarding");
  const [text, setText] = useState(index === "new" ? "#" : colors[index]);
  const [hue, setHue] = useState(() => nearestHue(normalizeHex(text)));
  const [saving, setSavingState] = useState(false);
  const setSaving = (v: boolean) => {
    setSavingState(v);
    onBusy(v);
  };
  const [error, setError] = useState<string | null>(null);

  const hex = normalizeHex(text);
  const duplicate = hex !== null && colors.some((c, i) => c === hex && i !== index);
  const hint = !hex ? t("brand.hexHint") : duplicate ? t("brand.duplicateColor") : null;

  async function save(next: string[]) {
    setSaving(true);
    setError(null);
    try {
      await saveBrandColors(next);
      onClose();
    } catch {
      setError(t("brand.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const pick = (h: string) => {
    setText(h);
    setError(null);
  };

  return (
    <>
      <Text style={type.pageTitle} accessibilityRole="header">
        {index === "new" ? t("brand.addColor") : t("brand.editColor")}
      </Text>

      {/* Tap a colour, then fine-tune; the hex field below is for people who know their exact code */}
      <Text style={[type.meta, { paddingTop: space[12], paddingBottom: space[8] }]}>{t("brand.pickColor")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hues}>
        {HUES.map((c, i) => (
          <Pressable
            key={c.key}
            onPress={() => {
              setHue(i);
              pick(hslToHex(c.h, c.s, 50));
            }}
            accessibilityRole="button"
            accessibilityLabel={t(`brand.hues.${c.key}`)}
            accessibilityState={{ selected: i === hue }}
            style={[styles.hue, { backgroundColor: hslToHex(c.h, c.s, 50) }, i === hue && styles.selected]}
          />
        ))}
      </ScrollView>
      <View style={styles.shades}>
        {SHADES.map((sh) => {
          const h = hslToHex(HUES[hue].h, HUES[hue].s, sh.l);
          return (
            <Pressable
              key={sh.key}
              onPress={() => pick(h)}
              accessibilityRole="button"
              accessibilityLabel={`${t(`brand.hues.${HUES[hue].key}`)}, ${t(`brand.shades.${sh.key}`)}`}
              accessibilityState={{ selected: h === hex }}
              style={[styles.shade, { backgroundColor: h }, h === hex && styles.selected]}
            />
          );
        })}
      </View>

      <View style={[styles.row, { alignItems: "center" }]}>
        <View style={[styles.preview, { backgroundColor: hex ?? "transparent" }]} accessibilityElementsHidden importantForAccessibility="no" />
        <Button label={t("brand.lighter")} variant="outline" height={44} disabled={!hex} onPress={() => hex && pick(shade(hex, 8))} style={{ flex: 1 }} />
        <Button label={t("brand.darker")} variant="outline" height={44} disabled={!hex} onPress={() => hex && pick(shade(hex, -8))} style={{ flex: 1 }} />
      </View>

      <View style={{ paddingTop: space[12] }}>
        <Field
          label={t("brand.hexLabel")}
          value={text}
          onChangeText={pick}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          placeholder="#7C6754"
          returnKeyType="done"
          height={48}
          editable={!saving}
        />
      </View>
      {/* One announced line for both the input hint and a failed save; words, not just red */}
      <Text
        accessibilityLiveRegion="polite"
        style={[type.meta, { color: error || (text.length > 1 && hint) ? color.error : color.inkSecondary, minHeight: 18, paddingTop: space[8] }]}
      >
        {error ?? (text.length > 1 ? hint : null) ?? ""}
      </Text>
      <View style={{ gap: space[8], paddingTop: space[8] }}>
        <Button
          label={t("brand.saveColor")}
          disabled={!hex || duplicate}
          loading={saving}
          onPress={() => hex && void save(index === "new" ? [...colors, hex] : colors.map((c, i) => (i === index ? hex : c)))}
        />
        {index !== "new" && colors.length > 1 ? (
          <Button label={t("brand.removeColor")} variant="outline" disabled={saving} onPress={() => void save(colors.filter((_, i) => i !== index))} />
        ) : null}
        <Button label={t("brand.cancel")} variant="ghost" height={44} disabled={saving} onPress={onClose} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // 44 px colours in a scrolling row, then five ≥52 px shades: comfortable touch targets on small phones
  hues: { gap: space[8], paddingVertical: 2 },
  hue: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  shades: { flexDirection: "row", gap: space[8], paddingTop: space[12] },
  shade: { flex: 1, height: 52, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  selected: { borderWidth: 3, borderColor: color.ink },
  scrim: { flex: 1, backgroundColor: "rgba(16,16,20,0.4)" },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: space[24],
    paddingTop: space[12],
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.disabledBg,
    marginBottom: space[16],
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[12],
    paddingTop: space[16],
  },
  preview: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.controlOutline,
  },
});
