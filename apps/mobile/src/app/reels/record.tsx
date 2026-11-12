import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { router, useLocalSearchParams } from "expo-router";
import { Mic, Square } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { type PlanResult, reels } from "@/api/endpoints";
import { color, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { BackTitle, BrandPill, ICON, PageHeader, Panel, ReelsScreen, bodyMuted, eyebrow, meta, rc } from "@/ui/reels/kit";
import { useReel } from "@/ui/reels/use-reel";

const MAX_SECONDS = 15;
/** AAC in an M4A, mono 128 kbps: 15 s ≈ 250 KB (the server converts it to the render's WAV). */
const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 128_000 };
type Take = { id: string; seconds: number; transcript: string; matches: boolean };

/** R11 → Record voiceover: the person reads one scene's text; what was heard is checked against it. */
export default function ReelsRecord() {
  const { t } = useTranslation("reels");
  const { scene } = useLocalSearchParams<{ scene: string }>();
  const i = Number(scene);
  const { id, detail, busy, save } = useReel();
  const plan = detail?.plan ?? null;
  const text = plan?.scenes[i]?.voiceText ?? "";
  // A take is sent once, whether it ended at 15 s (the recorder's own stop) or by a tap on Stop.
  // A take waiting to be sent (set at start, cleared by the first send): Stop and the finish event both try.
  const pending = useRef(false);
  const starting = useRef(false);
  const onFinished = useRef<(uri: string) => void>(() => {});
  const recorder = useAudioRecorder(OPTIONS, (status) => {
    if (status.isFinished && status.url) onFinished.current(status.url);
  });
  const state = useAudioRecorderState(recorder, 250);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [take, setTake] = useState<Take | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const p = await AudioModule.requestRecordingPermissionsAsync();
      if (p.granted) await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      setAllowed(p.granted);
    })();
    // Leaving: the rest of the app plays sound only.
    return () => void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, []);

  const start = async () => {
    if (starting.current || state.isRecording) return; // a second tap before the recorder reports recording
    starting.current = true;
    setProblem(null);
    setTake(null);
    try {
      await recorder.prepareToRecordAsync();
      pending.current = true;
      recorder.record({ forDuration: MAX_SECONDS });
    } finally {
      starting.current = false;
    }
  };
  const send = async (uri: string) => {
    if (!pending.current || !id || !plan) return;
    pending.current = false;
    setSending(true);
    try {
      setTake(await reels.uploadRecording(id, uri, text, plan.language));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };
  const stop = async () => {
    await recorder.stop();
    if (recorder.uri) await send(recorder.uri);
  };
  useEffect(() => {
    onFinished.current = (uri) => void send(uri);
  });
  // Android doesn't always report the 15 s stop as finished: a recorder that stops by itself sends its take too
  // (the pending flag keeps a tap on Stop and this from both sending it).
  const wasRecording = useRef(false);
  useEffect(() => {
    if (wasRecording.current && !state.isRecording && recorder.uri) onFinished.current(recorder.uri);
    wasRecording.current = state.isRecording;
  }, [state.isRecording, recorder]);

  /** Attaches the take to the scene; "Keep it" also makes the scene's text what was said. */
  const use = async (keepWhatWasSaid: boolean) => {
    if (!plan || !take) return;
    const scenes = plan.scenes.map((s, n) => (n === i ? { ...s, recordingId: take.id, voiceText: keepWhatWasSaid ? take.transcript : s.voiceText } : s));
    const saved = (await save({ ...plan, scenes })) as PlanResult | null;
    if (!saved) return;
    // The plan changed while recording (another scene text, another device): the take didn't stick.
    if (saved.droppedRecordings?.includes(i + 1) || !saved.plan.scenes[i]?.recordingId) return setProblem(t("script.recordingDropped", { n: i + 1 }));
    router.back();
  };

  const seconds = Math.min(MAX_SECONDS, Math.floor(state.durationMillis / 1000));
  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={Number.isInteger(i) ? t("record.title", { n: i + 1 }) : ""} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
      footer={
        <Footer>
          {problem ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{problem}</Text> : null}
          {take && take.matches ? <Button label={busy ? t("script.saving") : t("record.use")} arrow disabled={busy} onPress={() => void use(false)} /> : null}
          {take && !take.matches ? (
            <>
              {/* Nothing heard: there is nothing to keep. */}
              {take.transcript ? <Button label={busy ? t("script.saving") : t("record.keep")} disabled={busy} onPress={() => void use(true)} /> : null}
              <Button variant="outline" label={t("record.again")} disabled={busy} onPress={() => void start()} />
            </>
          ) : null}
        </Footer>
      }
    >
      <Text style={[bodyMuted, { paddingHorizontal: 4 }]}>{t("record.intro", { seconds: MAX_SECONDS })}</Text>
      <Panel style={{ marginTop: space[16] }}>
        <Text style={eyebrow}>{t("record.read")}</Text>
        <Text style={[type.body, { paddingTop: space[8], fontSize: 20, lineHeight: 28 }]}>{text}</Text>
      </Panel>

      <View style={{ alignItems: "center", paddingTop: space[32], gap: space[12] }}>
        {allowed === false ? (
          <Text style={[meta, { color: color.error, textAlign: "center" }]}>{t("record.noMic")}</Text>
        ) : sending ? (
          <>
            <ActivityIndicator color={color.primary} />
            <Text style={meta}>{t("record.checking")}</Text>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state.isRecording ? t("record.stopA11y") : t("record.startA11y")}
              disabled={!allowed || !plan || !text || busy}
              onPress={() => void (state.isRecording ? stop() : start())}
              style={[styles.mic, state.isRecording && { backgroundColor: color.error }, (!allowed || !plan) && { opacity: 0.4 }]}
            >
              {state.isRecording ? <Square size={28} color={color.onPrimary} fill={color.onPrimary} /> : <Mic size={32} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />}
            </Pressable>
            <Text style={meta}>{state.isRecording ? t("record.timer", { seconds, max: MAX_SECONDS }) : take ? t("record.length", { seconds: take.seconds.toFixed(1) }) : t("record.tap")}</Text>
          </>
        )}
      </View>

      {take ? (
        <Panel style={{ marginTop: space[24] }}>
          <Text style={eyebrow}>{take.matches ? t("record.heardMatches") : t("record.heardDiffers")}</Text>
          <Text style={[type.body, { paddingTop: space[8] }]}>{take.transcript || t("record.nothingHeard")}</Text>
          {!take.matches && take.transcript ? <Text style={[meta, { paddingTop: space[8] }]}>{t("record.keepNote")}</Text> : null}
        </Panel>
      ) : null}
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  mic: { width: 88, height: 88, borderRadius: 44, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
});
