import { Image } from "expo-image";
import { router } from "expo-router";
import { Mic, Play, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Footer } from "@/ui/layout";
import { ActionButton, BackTitle, BrandPill, ICON, PageHeader, Panel, ReelsScreen, Tag, eyebrow, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { photos, scriptFr } from "@/ui/reels/sample";

/** R11 · Reels / Script and voice. */
export default function ReelsScript() {
  const { t } = useTranslation("reels");
  const [script, setScript] = useState(scriptFr);
  const words = script.split(/\s+/).filter((w) => /\w/.test(w)).length;

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("script.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
      footer={
        <Footer>
          <Button label={t("script.continue")} arrow onPress={() => router.push("/reels/storyboard")} />
          <Text style={[meta, { textAlign: "center", marginTop: -4 }]}>{t("script.costNote")}</Text>
        </Footer>
      }
    >
      <Panel style={styles.product}>
        <Image source={photos.table} style={styles.thumb} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={eyebrow}>{t("script.targetProduct")}</Text>
          <Text style={strong14} numberOfLines={1}>
            Table à manger Acacia Bunting 240cm
          </Text>
          <Text style={meta}>{t("script.productMeta")}</Text>
        </View>
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <Text style={eyebrow}>{t("script.voiceoverScript")}</Text>
            <Tag label={t("script.frenchFr")} tone="grey" style={{ borderWidth: 0 }} textStyle={{ color: color.ink }} />
          </View>
          <Text style={meta}>{t("script.wordCount", { count: words, seconds: Math.round(words / 2) })}</Text>
        </View>
        <View style={{ paddingTop: space[12] }}>
          <Field
            multiline
            value={script}
            onChangeText={setScript}
            accessibilityLabel={t("script.scriptA11y")}
            style={{ flex: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.ink, height: 120, textAlignVertical: "top" }}
          />
        </View>
        <View style={[styles.rowBetween, { paddingTop: 14 }]}>
          <Text style={meta}>{t("script.targetDuration", { count: 20 })}</Text>
          <ActionButton label={t("script.rewriteOpening")} variant="ghost" leading={RefreshCw} height={44} style={{ gap: 4 }} />
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
              <Text style={strong14}>{t("script.calmVoice")}</Text>
              <Text style={meta}>{t("script.calmVoiceMeta")}</Text>
            </View>
          </View>
          <ActionButton label={t("preview")} variant="ghost" leading={Play} height={44} style={{ gap: 4, paddingHorizontal: space[12] }} />
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
          <Pressable accessibilityRole="button" accessibilityLabel={t("script.record")} style={styles.recordBtn}>
            <Text style={type.label}>{t("script.record")}</Text>
          </Pressable>
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
  recordBtn: {
    minHeight: 44,
    paddingHorizontal: space[12],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
});
