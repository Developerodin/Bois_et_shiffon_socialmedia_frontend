import { router } from "expo-router";
import { Check, ShieldCheck, UserRound, VideoOff, Volume2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { BackTitle, BrandPill, ICON, PageHeader, ReelsScreen, bodyMuted, eyebrow, meta, rc, strong14, Tag } from "@/ui/reels/kit";

/** Title/subtitle live at reels:actor.style.<id>. */
const STYLES = ["calm", "expressive"] as const;

/** R10 · Reels / AI Actor. */
export default function ReelsActor() {
  const { t } = useTranslation("reels");
  const [choice, setChoice] = useState<string>("none");
  // Presenters who speak on camera need lip-synced video: a later step. Until then a reel is product-only.
  const [soon, setSoon] = useState(false);
  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("actor.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
      footer={
        <Footer>
          {soon ? <Text style={[meta, { textAlign: "center" }]}>{t("actor.comingSoon")}</Text> : null}
          <Button label={t("common:continue")} arrow onPress={() => router.push("/reels/script")} />
        </Footer>
      }
    >
      <Text style={[bodyMuted, { paddingHorizontal: 4 }]}>{t("actor.intro")}</Text>

      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: choice === "none" }}
        accessibilityLabel={t("actor.noPresenterA11y")}
        onPress={() => setChoice("none")}
        style={[styles.option, { marginTop: space[24] }, choice === "none" && styles.optionOn]}
      >
        <View style={{ flexDirection: "row", gap: space[12], paddingTop: space[8] }}>
          <View style={styles.noIcon}>
            <VideoOff size={24} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={strong14}>{t("noPresenter")}</Text>
              <Tag label={t("actor.recommended")} tone="dark" style={{ backgroundColor: "#111113" }} />
            </View>
            <Text style={[meta, { paddingTop: 2 }]}>{t("actor.noPresenterBody")}</Text>
          </View>
          <Radio on={choice === "none"} />
        </View>
      </Pressable>

      <Text style={[eyebrow, { paddingTop: space[24], paddingHorizontal: 4 }]}>{t("actor.styles")}</Text>
      <View style={{ flexDirection: "row", gap: space[16], paddingTop: space[8] }}>
        {STYLES.map((id) => {
          const on = choice === id;
          const s = { title: t(`actor.style.${id}.title`), subtitle: t(`actor.style.${id}.subtitle`) };
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t("actor.styleA11y", s)}
              onPress={() => (setChoice("none"), setSoon(true))}
              style={[styles.option, styles.styleCard, on && styles.optionOn]}
            >
              <View style={{ alignItems: "center" }}>
                <View style={styles.avatar}>
                  <UserRound size={28} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                </View>
                <Text style={[strong14, { textAlign: "center", paddingTop: space[8] }]}>{s.title}</Text>
                <Text style={[meta, { textAlign: "center" }]}>{s.subtitle}</Text>
              </View>
              <View>
                <Pressable accessibilityRole="button" accessibilityLabel={t("actor.sampleVoiceA11y", { title: s.title })} style={styles.sample}>
                  <Volume2 size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
                  <Text style={[strong14, { fontFamily: "Inter_500Medium" }]}>{t("actor.sampleVoice")}</Text>
                </Pressable>
                <View style={styles.voiceTag}>
                  <Text style={[meta, { textAlign: "center" }]}>{t("actor.voiceLed")}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.notice}>
        <ShieldCheck size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} style={{ marginTop: 2 }} />
        <Text style={[bodyMuted, { flex: 1 }]}>{t("actor.notice")}</Text>
      </View>
    </ReelsScreen>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <View style={[styles.radio, on ? { backgroundColor: color.primary } : { borderWidth: 1, borderColor: "#D4D4DC" }]}>
      {on ? <Check size={14} color={color.onPrimary} strokeWidth={2.25} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { padding: space[16], backgroundColor: color.surface, borderWidth: 1, borderColor: "#E4E3E9", borderRadius: radius.card },
  optionOn: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary },
  noIcon: { width: 48, height: 48, borderRadius: radius.control, backgroundColor: rc.tagGrey, alignItems: "center", justifyContent: "center" },
  radio: { width: 24, height: 24, marginTop: 2, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  styleCard: { flex: 1, minHeight: 232, justifyContent: "space-between" },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: rc.tagGrey, borderWidth: 1, borderColor: "#E0E7FF", alignItems: "center", justifyContent: "center" },
  sample: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 44, borderRadius: radius.control },
  voiceTag: { marginTop: space[8], paddingVertical: 2, borderRadius: radius.badge, backgroundColor: rc.tagGrey, borderWidth: 1, borderColor: color.divider },
  notice: {
    marginTop: space[24],
    flexDirection: "row",
    gap: space[12],
    padding: space[12],
    backgroundColor: rc.tagGrey,
    borderWidth: 1,
    borderColor: "#E4E4EB",
    borderRadius: radius.control,
  },
});
