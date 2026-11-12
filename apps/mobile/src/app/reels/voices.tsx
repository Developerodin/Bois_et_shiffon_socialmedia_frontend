import { router } from "expo-router";
import { useVideoPlayer } from "expo-video";
import { Check, Pause, Play } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { reels, type ReelVoiceOption } from "@/api/endpoints";
import { color, radius, space } from "@/theme/tokens";
import { BackTitle, BrandPill, ICON, PageHeader, ReelsScreen, bodyMuted, meta, rc, strong14 } from "@/ui/reels/kit";
import { useReel } from "@/ui/reels/use-reel";

/** R11 → Voices: every voice a reel may use, each with a sample. Picking one saves it on the plan and goes back. */
export default function ReelsVoices() {
  const { t } = useTranslation("reels");
  const { detail, busy, error, save } = useReel();
  const plan = detail?.plan ?? null;
  const [voices, setVoices] = useState<ReelVoiceOption[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  // One player for the samples (expo-video plays audio-only files too); the source follows the voice being played.
  const sample = voices?.find((v) => v.id === playing)?.sampleUrl ?? null;
  const player = useVideoPlayer(sample);
  // The player keeps its source between samples: start each new one, and drop the pause icon when it ends or fails.
  useEffect(() => {
    if (sample) player.play();
  }, [sample, player]);
  useEffect(() => {
    const end = player.addListener("playToEnd", () => setPlaying(null));
    const status = player.addListener("statusChange", ({ status }) => status === "error" && setPlaying(null));
    return () => (end.remove(), status.remove());
  }, [player]);

  useEffect(() => {
    const ctrl = new AbortController();
    reels.voices(ctrl.signal).then(
      (r) => setVoices(r.voices),
      (e: unknown) => !ctrl.signal.aborted && setProblem(e instanceof Error ? e.message : String(e)),
    );
    return () => ctrl.abort();
  }, []);

  // A ref, not state: two taps in one frame would both pass a state check (two saves, or two backs).
  const picking = useRef(false);
  const pick = async (id: string) => {
    if (!plan || busy || picking.current) return;
    picking.current = true;
    const ok = id === plan.voice || !!(await save({ ...plan, voice: id }));
    if (ok) router.back();
    else picking.current = false;
  };

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("voices.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
    >
      <Text style={[bodyMuted, { paddingHorizontal: 4 }]}>{t("voices.intro")}</Text>
      {error || problem ? <Text style={[meta, { color: color.error, paddingTop: space[12] }]}>{error ?? problem}</Text> : null}
      {!voices && !problem ? <ActivityIndicator style={{ paddingTop: space[24] }} color={color.primary} /> : null}
      <View style={{ gap: space[12], paddingTop: space[16] }}>
        {voices?.map((v) => {
          const on = v.id === plan?.voice;
          const gender = t(`voices.gender.${v.gender}`);
          return (
            <View key={v.id} style={[styles.row, on && styles.rowOn]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={playing === v.id ? t("voices.stopA11y", { name: v.name }) : t("voices.playA11y", { name: v.name })}
                disabled={!v.sampleUrl}
                onPress={() => setPlaying(playing === v.id ? null : v.id)}
                style={[styles.play, !v.sampleUrl && { opacity: 0.4 }]}
              >
                {playing === v.id ? <Pause size={20} color={color.ink} strokeWidth={ICON.strokeWidth} /> : <Play size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />}
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: busy || !plan }}
                accessibilityLabel={`${v.name}, ${gender}`}
                disabled={busy || !plan}
                onPress={() => void pick(v.id)}
                style={styles.pick}
              >
                <View style={{ flex: 1 }}>
                  <Text style={strong14}>{v.name}</Text>
                  <Text style={[meta, { paddingTop: 2 }]}>{gender}</Text>
                </View>
                <View style={[styles.radio, on ? { backgroundColor: color.primary } : { borderWidth: 1, borderColor: "#D4D4DC" }]}>
                  {on ? <Check size={14} color={color.onPrimary} strokeWidth={2.25} /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[8], padding: space[12], backgroundColor: color.surface, borderWidth: 1, borderColor: "#E4E3E9", borderRadius: radius.card },
  rowOn: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary, padding: 11 },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: rc.tagGrey, alignItems: "center", justifyContent: "center" },
  pick: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 44 },
  radio: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
