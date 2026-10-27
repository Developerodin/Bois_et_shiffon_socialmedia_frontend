import { Fragment } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowLeft, Check, Info } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Button } from "@/ui/button";
import { BrandChip, Glow, ps, STROKE, TopBar } from "@/ui/photoshoot/chrome";
import { Page } from "@/ui/photoshoot/controls";
import { generation, photoshootImages, say } from "@/ui/photoshoot/sample";
import { color, font, radius, space, type } from "@/theme/tokens";

/**
 * F05 · Photoshoot / Generating. Static progress from sample data: there is no generation job to poll yet.
 * "Back to workspace" returns to Create; "Return to workspace" opens Results, where the job is listed.
 */
export default function Generating() {
  const { t } = useTranslation("photoshoot");
  return (
    <Page
      background={
        <Glow
          blobs={[
            { x: 40, y: 230, size: 288, color: "#E5E2F4", opacity: 0.7 },
            { x: 360, y: 520, size: 320, color: "#F4E6E2", opacity: 0.5 },
            { x: 300, y: 120, size: 256, color: "#E8EEF8", opacity: 0.6 },
          ]}
        />
      }
      header={
        <TopBar
          leading={
            <Pressable accessibilityRole="button" accessibilityLabel={t("generating.backToWorkspace")} onPress={() => router.dismissTo("/photoshoot")} style={styles.backLink}>
              <ArrowLeft size={20} color={color.ink} strokeWidth={STROKE} />
              <Text style={type.label}>{t("generating.backToWorkspace")}</Text>
            </Pressable>
          }
          trailing={<BrandChip label />}
        />
      }
      contentStyle={styles.content}
      footer={<Button label={t("generating.returnToWorkspace")} onPress={() => router.replace("/photoshoot/results")} />}
    >
      <View style={styles.hero}>
        <Spinner />
        <Text style={[type.pageTitle, { textAlign: "center", paddingTop: space[4] }]} accessibilityRole="header">
          {t("generating.title")}
        </Text>
        <Text style={[type.body, styles.heroBody]}>{say(t, generation.description)}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Image source={generation.image} style={styles.thumb} contentFit="cover" accessibilityLabel="Table à manger rectangulaire 240cm Acacia Bunting" />
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { fontFamily: font.semibold }]}>{say(t, generation.title)}</Text>
            <View style={styles.metaRow}>
              {generation.meta.map((m, i) => (
                <Fragment key={i}>
                  {i > 0 ? <View style={styles.metaDot} /> : null}
                  <Text style={type.meta}>{say(t, m)}</Text>
                </Fragment>
              ))}
            </View>
          </View>
        </View>

        <View accessibilityRole="list">
          {generation.steps.map((s, i) => (
            <View
              key={s.label}
              style={[styles.step, i > 0 && { paddingTop: space[12] }]}
              accessible
              accessibilityLabel={t("generating.stepStatus", { step: t(`generating.steps.${s.label}`), status: t(STATUS[s.status]) })}
            >
              <View style={styles.stepLeft}>
                <StepMark status={s.status} />
                <Text style={[type.meta, s.status !== "queued" && { color: color.ink }]}>{t(`generating.steps.${s.label}`)}</Text>
              </View>
              <Text style={[type.meta, s.status === "active" && { color: color.ink }]}>{t(STATUS[s.status])}</Text>
            </View>
          ))}
        </View>

        <View style={styles.note}>
          <Info size={16} color={color.inkSecondary} strokeWidth={STROKE} style={{ marginTop: 2 }} />
          <Text style={[type.body, { color: color.inkSecondary, flex: 1 }]}>{t("generating.note")}</Text>
        </View>
      </View>
    </Page>
  );
}

/** Status label keys in photoshoot.json. */
const STATUS = { done: "generating.status.done", active: "generating.status.active", queued: "generating.status.queued" } as const;

function StepMark({ status }: { status: keyof typeof STATUS }) {
  if (status === "done")
    return (
      <View style={[styles.mark, { backgroundColor: ps.black }]}>
        <Check size={14} color={color.onPrimary} strokeWidth={2.5} />
      </View>
    );
  if (status === "active")
    return (
      <View style={[styles.mark, { borderWidth: 1, borderColor: "rgba(16,16,20,0.3)" }]}>
        <View style={styles.activeRing} />
      </View>
    );
  return (
    <View style={[styles.mark, { backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: ps.hairline }]}>
      <View style={styles.queuedDot} />
    </View>
  );
}

/** Logomark tile inside a ring, over a soft tri-colour halo (Figma 112×112 "Container"). */
function Spinner() {
  const { t } = useTranslation("photoshoot");
  return (
    <View style={styles.spinner} accessibilityRole="progressbar" accessibilityLabel={t("generating.progress")}>
      <Svg width={112} height={112} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="halo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#DDD9EB" />
            <Stop offset="0.5" stopColor="#F1E8EC" />
            <Stop offset="1" stopColor="#DEE8F4" />
          </LinearGradient>
        </Defs>
        <Circle cx={56} cy={56} r={47} fill="url(#halo)" opacity={0.78} />
        <Circle cx={56} cy={56} r={48} stroke={ps.black} strokeWidth={2} fill="none" />
      </Svg>
      <View style={styles.logoTile}>
        <Image source={photoshootImages.logomark} style={{ width: 48, height: 48 }} contentFit="contain" accessibilityLabel="Espanda" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space[8], marginLeft: -4, borderRadius: radius.control },
  content: { flexGrow: 1, justifyContent: "space-between", paddingTop: space[8], paddingBottom: space[24] },
  hero: { alignItems: "center", paddingTop: space[8], paddingBottom: space[16] },
  heroBody: { color: color.inkSecondary, textAlign: "center", maxWidth: 300, paddingTop: space[8] },
  spinner: { width: 112, height: 112, marginVertical: space[12], alignItems: "center", justifyContent: "center" },
  logoTile: {
    width: 80,
    height: 80,
    borderRadius: radius.control,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.7)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ps.black,
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  card: {
    marginTop: space[24],
    gap: space[16],
    padding: space[16],
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.8)",
    borderRadius: radius.card,
    shadowColor: ps.black,
    shadowOpacity: 0.04,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space[12], paddingBottom: space[12], borderBottomWidth: 1, borderBottomColor: "rgba(232,231,237,0.6)" },
  thumb: { width: 56, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(232,231,237,0.6)", backgroundColor: color.canvasAlt },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[4] },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(121,121,131,0.5)" },
  step: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepLeft: { flexDirection: "row", alignItems: "center", gap: space[12] },
  mark: { width: 20, height: 20, borderRadius: radius.badge, alignItems: "center", justifyContent: "center" },
  activeRing: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: ps.black },
  queuedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ps.dot },
  note: { flexDirection: "row", gap: space[8], padding: space[12], marginTop: space[4], backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: "rgba(232,231,237,0.6)", borderRadius: radius.control },
});
