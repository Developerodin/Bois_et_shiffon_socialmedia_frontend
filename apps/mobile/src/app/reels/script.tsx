import { Image } from "expo-image";
import { router } from "expo-router";
import { Mic, Play, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Footer } from "@/ui/layout";
import { ActionButton, BackTitle, BrandPill, ICON, PageHeader, Panel, ReelsScreen, Tag, eyebrow, languageName, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { useReel } from "@/ui/reels/use-reel";

/** OpenAI voices the server accepts (apps/web/server/reels/voice.ts). */
const VOICES = ["coral", "sage", "ash", "ballad", "verse"] as const;
const words = (text: string) => text.split(/\s+/).filter((w) => /\w/.test(w)).length;

/** R11 · Reels / Script and voice. One paragraph per scene (blank line between), so the box stays as designed. */
export default function ReelsScript() {
  const { t, i18n } = useTranslation("reels");
  const { detail, busy, error, save, chat } = useReel();
  const plan = detail?.plan;
  const language = languageName(plan?.language, i18n.language);
  const [edited, setEdited] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const script = edited ?? plan?.scenes.map((s) => s.voiceText).join("\n\n") ?? "";
  const parts = script.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const total = words(script);
  const tooLong = parts.findIndex((x) => words(x) > 30);
  const countMismatch = !!plan && parts.length !== plan.scenes.length;
  const currentVoice = voice ?? plan?.voice ?? VOICES[0];
  const thumb = plan ? detail?.photoUrls[plan.scenes[0].photoKey] : undefined;
  const onContinue = async () => {
    if (!plan) return;
    if (edited !== null || voice !== null) {
      const next = { ...plan, voice: currentVoice, scenes: plan.scenes.map((s, i) => ({ ...s, voiceText: parts[i] ?? s.voiceText })) };
      if (!(await save(next))) return;
    }
    router.push("/reels/storyboard");
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
              <Text style={strong14}>{t("script.voiceName", { name: currentVoice })}</Text>
              <Text style={meta}>{t("script.calmVoiceMeta")}</Text>
            </View>
          </View>
          <ActionButton
            label={t("script.nextVoice")}
            variant="ghost"
            leading={Play}
            height={44}
            style={{ gap: 4, paddingHorizontal: space[12] }}
            onPress={() => setVoice(VOICES[(VOICES.indexOf(currentVoice as (typeof VOICES)[number]) + 1) % VOICES.length])}
          />
        </View>
        <View style={[styles.record, { marginTop: space[12] }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View style={styles.micRound}>
              <Mic size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={metaInk}>{t("script.recordOwn")}</Text>
              <Text style={meta}>{t("script.recordOwnMeta")}</Text>
            </View>
          </View>
          {/* No recording backend yet: shown as coming soon rather than as a button that does nothing. */}
          <Tag label={t("comingSoon")} tone="grey" />
        </View>
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
