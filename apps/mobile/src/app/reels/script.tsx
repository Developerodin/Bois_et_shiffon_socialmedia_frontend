import { Image } from "expo-image";
import { router } from "expo-router";
import { Mic, Play, RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { type PlanResult, reels, type ReelVoiceOption } from "@/api/endpoints";
import { color, font, radius, space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Footer } from "@/ui/layout";
import { ActionButton, BackTitle, BrandPill, ICON, PageHeader, Panel, ReelsScreen, Tag, eyebrow, languageName, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { useReel } from "@/ui/reels/use-reel";

const words = (text: string) => text.split(/\s+/).filter((w) => /\w/.test(w)).length;

/** R11 · Reels / Script and voice. One paragraph per scene (blank line between), so the box stays as designed. */
export default function ReelsScript() {
  const { t, i18n } = useTranslation("reels");
  const { detail, busy, error, save, chat } = useReel();
  const plan = detail?.plan;
  const language = languageName(plan?.language, i18n.language);
  const [edited, setEdited] = useState<string | null>(null);
  const script = edited ?? plan?.scenes.map((s) => s.voiceText).join("\n\n") ?? "";
  const parts = script.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const total = words(script);
  const tooLong = parts.findIndex((x) => words(x) > 30);
  const countMismatch = !!plan && parts.length !== plan.scenes.length;
  // The voice's name for the row (voices are picked on their own screen, which saves them).
  const [voices, setVoices] = useState<ReelVoiceOption[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    reels.voices(ctrl.signal).then((r) => setVoices(r.voices), () => {});
    return () => ctrl.abort();
  }, []);
  const voice = voices?.find((v) => v.id === plan?.voice);
  const thumb = plan ? detail?.photoUrls[plan.scenes[0].photoKey] : undefined;
  // Recordings follow their text: an edited scene loses its take, and the server says so before moving on.
  const [dropped, setDropped] = useState<number[]>([]);
  const onContinue = async () => {
    if (!plan) return;
    if (edited !== null) {
      const next = { ...plan, scenes: plan.scenes.map((s, i) => ({ ...s, voiceText: parts[i] ?? s.voiceText })) };
      const saved = (await save(next)) as PlanResult | null;
      if (!saved) return;
      setEdited(null);
      if (saved.droppedRecordings?.length) return setDropped(saved.droppedRecordings);
    }
    router.push("/reels/storyboard");
  };
  const removeRecording = async (i: number) => {
    if (!plan) return;
    await save({ ...plan, scenes: plan.scenes.map((s, n) => (n === i ? { ...s, recordingId: undefined, recordingSeconds: undefined } : s)) });
  };

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("script.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
      footer={
        <Footer>
          {error ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          {dropped.map((n) => (
            <Text key={n} style={[meta, { textAlign: "center" }]}>
              {t("script.recordingDropped", { n })}
            </Text>
          ))}
          <Button label={busy ? t("script.saving") : t("script.continue")} arrow onPress={() => void onContinue()} disabled={busy || !plan || tooLong >= 0 || countMismatch} />
          <Text style={[meta, { textAlign: "center", marginTop: -4 }]}>{t("script.costNote")}</Text>
        </Footer>
      }
    >
      <Panel style={styles.product}>
        <Image source={thumb ? { uri: thumb } : undefined} style={[styles.thumb, { backgroundColor: rc.tagGrey }]} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={eyebrow}>{t("script.targetProduct")}</Text>
          <Text style={strong14} numberOfLines={1}>
            {plan?.title ?? ""}
          </Text>
        </View>
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <Text style={eyebrow}>{t("script.voiceoverScript")}</Text>
            {language ? <Tag label={t("script.languageTag", { language, code: plan?.language?.toUpperCase() })} tone="grey" style={{ borderWidth: 0 }} textStyle={{ color: color.ink }} /> : null}
          </View>
          <Text style={meta}>{t("script.wordCount", { count: total, seconds: Math.round(total / 2) })}</Text>
        </View>
        <View style={{ paddingTop: space[12] }}>
          <Field
            multiline
            value={script}
            onChangeText={setEdited}
            accessibilityLabel={t("script.scriptA11y", { context: language ? "lang" : undefined, language })}
            style={{ flex: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.ink, height: 120, textAlignVertical: "top" }}
          />
        </View>
        <View style={[styles.rowBetween, { paddingTop: 14 }]}>
          <Text style={[meta, { flex: 1, color: tooLong >= 0 || countMismatch ? color.error : color.inkSecondary }]}>
            {tooLong >= 0 ? t("script.sceneTooLong", { n: tooLong + 1 }) : countMismatch ? t("script.keepScenes", { count: plan?.scenes.length ?? 0 }) : t("script.targetDuration", { count: Math.round(total / 2) })}
          </Text>
          {busy ? (
            <ActivityIndicator color={color.primary} />
          ) : (
            <ActionButton label={t("script.rewriteOpening")} variant="ghost" leading={RefreshCw} height={44} style={{ gap: 4 }} onPress={() => void chat(t("script.rewriteOpeningAsk")).then(() => setEdited(null))} />
          )}
        </View>
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <Text style={eyebrow}>{t("script.narratorAudio")}</Text>
        <View style={[styles.voice, { marginTop: space[12] }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[12], flex: 1 }}>
            <View style={styles.micPill}>
              <Mic size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={strong14}>{t("script.voiceName", { name: voice?.name ?? "…" })}</Text>
              {voice ? <Text style={meta}>{t(`voices.gender.${voice.gender}`)}</Text> : voices ? <Text style={[meta, { color: color.error }]}>{t("voices.missing")}</Text> : null}
            </View>
          </View>
          <ActionButton
            label={t("script.changeVoice")}
            variant="ghost"
            leading={Play}
            height={44}
            style={{ gap: 4, paddingHorizontal: space[12] }}
            onPress={() => router.push("/reels/voices")}
          />
        </View>
        <Text style={[metaInk, { paddingTop: space[16] }]}>{t("script.recordOwn")}</Text>
        <Text style={meta}>{t("script.recordOwnMeta")}</Text>
        {/* One take per scene; a recorded scene uses it instead of the voice above. */}
        {plan?.scenes.map((s, i) => (
          <View key={i} style={[styles.record, { marginTop: space[8] }]}>
            <View style={styles.micRound}>
              <Mic size={20} color={s.recordingId ? color.primary : color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={metaInk} numberOfLines={1}>{t("script.sceneLine", { n: i + 1, text: s.voiceText })}</Text>
              <Text style={meta}>{s.recordingId ? t("script.recorded", { seconds: (s.recordingSeconds ?? 0).toFixed(1) }) : t("script.notRecorded")}</Text>
            </View>
            {s.recordingId ? (
              <ActionButton label={t("script.removeRecording")} variant="ghost" height={44} disabled={busy || edited !== null} onPress={() => void removeRecording(i)} />
            ) : null}
            <ActionButton
              label={s.recordingId ? t("script.recordAgain") : t("script.record")}
              variant="ghost"
              height={44}
              disabled={busy || edited !== null}
              onPress={() => router.push({ pathname: "/reels/record", params: { scene: String(i) } })}
            />
          </View>
        ))}
        {edited !== null ? <Text style={[meta, { paddingTop: space[8] }]}>{t("script.saveBeforeRecording")}</Text> : null}
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  product: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[12] },
  thumb: { width: 56, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  voice: {
    flexDirection: "row",
    alignItems: "center",
    padding: space[12],
    backgroundColor: "#EFEDFB",
    borderWidth: 2,
    borderColor: color.primary,
    borderRadius: radius.control,
  },
  micPill: { width: 26, height: 36, borderRadius: 15, backgroundColor: rc.tagGrey, alignItems: "center", justifyContent: "center" },
  record: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: space[12],
    backgroundColor: rc.field,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4D4DC",
    borderRadius: radius.control,
  },
  micRound: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.surface, borderWidth: 1, borderColor: rc.fieldBorder, alignItems: "center", justifyContent: "center" },
});
