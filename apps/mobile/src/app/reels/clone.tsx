import Constants from "expo-constants";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { router } from "expo-router";
import { Check, Mic, Square } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { type CloningInfo, reels } from "@/api/endpoints";
import { color, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Footer } from "@/ui/layout";
import { isPlanRequired } from "@/ui/plans/use-plan";
import { openLowCredits } from "@/ui/recovery/open";
import { BackTitle, BrandPill, ICON, PageHeader, Panel, ReelsScreen, bodyMuted, eyebrow, meta, rc } from "@/ui/reels/kit";

/** Same format as scene recordings (AAC in an M4A, mono 128 kbps): 90 s ≈ 1.5 MB. */
const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 128_000 };

/**
 * Voices → Clone a voice (workspace admins): read a passage for 60–90 s, tick the consent box, send. The reading goes
 * to ElevenLabs only (the server never keeps it); the consent text shown is the server's own, the version recorded.
 */
export default function ReelsClone() {
  const { t } = useTranslation("reels");
  const [info, setInfo] = useState<CloningInfo | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // The finished reading and its length (the recorder zeroes its own once it stops).
  const [taken, setTaken] = useState<{ uri: string; seconds: number } | null>(null);
  const uri = taken?.uri ?? null;
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const starting = useRef(false);
  const stopping = useRef(false);
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 250);
  const seconds = Math.floor(state.durationMillis / 1000);
  const max = info?.seconds.max ?? 90;
  const min = info?.seconds.min ?? 60;

  useEffect(() => {
    const ctrl = new AbortController();
    reels.voices(ctrl.signal).then((r) => setInfo(r.cloning), (e: unknown) => !ctrl.signal.aborted && setProblem(e instanceof Error ? e.message : String(e)));
    void (async () => {
      const p = await AudioModule.requestRecordingPermissionsAsync();
      if (p.granted) await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      setAllowed(p.granted);
    })();
    return () => (ctrl.abort(), void setAudioModeAsync({ allowsRecording: false }).catch(() => {}));
  }, []);

  // The reading stops itself at the maximum; its file is then kept for sending (the recorder reports it stopped).
  const wasRecording = useRef(false);
  const keep = useRef(setTaken); // a state setter never changes: safe to call from the effect below
  const lastSeconds = useRef(0);
  useEffect(() => {
    if (state.isRecording) lastSeconds.current = seconds;
  }, [state.isRecording, seconds]);
  useEffect(() => {
    if (wasRecording.current && !state.isRecording && recorder.uri) keep.current({ uri: recorder.uri, seconds: lastSeconds.current });
    wasRecording.current = state.isRecording;
  }, [state.isRecording, recorder]);

  const record = async () => {
    if (starting.current || state.isRecording) return;
    starting.current = true;
    setProblem(null);
    setTaken(null);
    try {
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: max });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e)); // e.g. the microphone is busy in another app
    } finally {
      starting.current = false;
    }
  };
  // A finished reading is only replaced on purpose.
  const start = () =>
    taken
      ? Alert.alert(t("clone.replaceTitle"), t("clone.replaceBody"), [
          { text: t("cancel"), style: "cancel" },
          { text: t("clone.replace"), style: "destructive", onPress: () => void record() },
        ])
      : void record();
  const stop = async () => {
    if (stopping.current) return;
    if (seconds < min) return setProblem(t("clone.tooShort", { min }));
    stopping.current = true;
    try {
      await recorder.stop();
    } finally {
      stopping.current = false;
    }
  };
  const send = async () => {
    if (!uri || !info || sending) return;
    setSending(true);
    setProblem(null);
    try {
      await reels.createClone(name.trim(), uri, Constants.expoConfig?.version);
      router.back();
    } catch (e) {
      if (isPlanRequired(e)) router.push("/plans");
      else if (e instanceof ApiError && e.status === 402) openLowCredits({ needed: info.credits, title: t("clone.title"), backdrop: t("voices.title") });
      else setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const ready = !!uri && !!name.trim() && agreed && !!info;
  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("clone.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
      footer={
        <Footer>
          {problem ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{problem}</Text> : null}
          <Button label={sending ? t("clone.sending") : t("clone.send", { count: info?.credits ?? 10 })} arrow disabled={!ready || sending} loading={sending} onPress={() => void send()} />
        </Footer>
      }
    >
      <Text style={[bodyMuted, { paddingHorizontal: 4 }]}>{t("clone.intro", { min, max })}</Text>
      <View style={{ paddingTop: space[16] }}>
        <Field label={t("clone.name")} value={name} onChangeText={setName} maxLength={40} placeholder={t("clone.namePlaceholder")} />
      </View>

      <Panel style={{ marginTop: space[16] }}>
        <Text style={eyebrow}>{t("clone.passageTitle")}</Text>
        <Text style={[type.body, { paddingTop: space[8], lineHeight: 26 }]}>{t("clone.passage")}</Text>
      </Panel>

      <View style={{ alignItems: "center", paddingTop: space[24], gap: space[12] }}>
        {allowed === false ? (
          <Text style={[meta, { color: color.error, textAlign: "center" }]}>{t("clone.noMic")}</Text>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state.isRecording ? t("clone.stopA11y") : t("clone.startA11y")}
              disabled={!allowed || sending}
              onPress={() => (state.isRecording ? void stop() : start())}
              style={[styles.mic, state.isRecording && { backgroundColor: color.error }, !allowed && { opacity: 0.4 }]}
            >
              {state.isRecording ? <Square size={28} color={color.onPrimary} fill={color.onPrimary} /> : <Mic size={32} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />}
            </Pressable>
            <Text style={meta}>
              {state.isRecording ? t("clone.timer", { seconds: Math.min(max, seconds), min }) : taken ? t("clone.recorded", { seconds: taken.seconds }) : t("clone.tap")}
            </Text>
          </>
        )}
      </View>

      {/* The consent text is the server's (its version is what the voice's consent record names). */}
      <Panel style={{ marginTop: space[24] }}>
        <Text style={eyebrow}>{t("clone.consentTitle")}</Text>
        <Text style={[type.body, { paddingTop: space[8] }]}>{info?.consent ?? ""}</Text>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed, disabled: !info }}
          accessibilityLabel={t("clone.consentTick")}
          disabled={!info}
          onPress={() => setAgreed(!agreed)}
          style={[styles.tick, !info && { opacity: 0.4 }]}
        >
          <View style={[styles.box, agreed && { backgroundColor: color.primary, borderColor: color.primary }]}>{agreed ? <Check size={14} color={color.onPrimary} strokeWidth={2.25} /> : null}</View>
          <Text style={type.body}>{t("clone.consentTick")}</Text>
        </Pressable>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  mic: { width: 88, height: 88, borderRadius: 44, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  tick: { flexDirection: "row", alignItems: "center", gap: space[12], paddingTop: space[12], minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: radius.badge, borderWidth: 1.5, borderColor: "#B9B8C3", alignItems: "center", justifyContent: "center" },
});
