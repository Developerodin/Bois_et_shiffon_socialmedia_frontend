import { Image } from "expo-image";
import { router } from "expo-router";
import { Lock, Sparkles, Volume2 } from "lucide-react-native";
import { Trans, useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { Footer } from "@/ui/layout";
import { ActionButton, BackButton, HeaderTitle, ICON, PageHeader, ReelsScreen, Tag, bodyMuted, eyebrow, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { storyboard } from "@/ui/reels/sample";

/** R03 · Reels / Storyboard. */
export default function ReelsStoryboard() {
  const { t } = useTranslation("reels");
  const facts = [
    t("storyboard.durationFact", { seconds: storyboard.seconds }),
    t("storyboard.verticalFact"),
    t("noPresenter"),
    t("scene.count", { count: storyboard.scenes.length }),
  ];
  return (
    <ReelsScreen
      header={
        <PageHeader
          left={<BackButton label={t("goBack")} />}
          center={<HeaderTitle center>{t("storyboard.title")}</HeaderTitle>}
          right={
            <View style={styles.productPill}>
              <View style={styles.dot} />
              <Text style={metaInk}>{storyboard.product}</Text>
            </View>
          }
        />
      }
      contentStyle={{ paddingTop: 12, paddingBottom: space[24] }}
      footer={
        <Footer>
          <View style={{ flexDirection: "row", gap: space[12] }}>
            <ActionButton label={t("storyboard.editInChat")} variant="ghost" leading={Sparkles} onPress={() => router.push("/reels/chat")} style={{ paddingHorizontal: space[16] }} />
            <ActionButton
              style={{ flex: 1 }}
              accessibilityLabel={t("storyboard.makeVideoA11y", { count: 40 })}
              onPress={() => router.push("/reels/generating")}
              label={
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
                  <Text style={[type.label, { color: color.onPrimary }]}>{t("storyboard.makeVideo")}</Text>
                  <View style={styles.sep} />
                  <Text style={[type.label, { color: color.onPrimary }]}>{t("storyboard.cost", { count: 40 })}</Text>
                </View>
              }
            />
          </View>
          <Text style={[bodyMuted, { textAlign: "center" }]}>{t("storyboard.balance", { balance: 160, count: 40 })}</Text>
        </Footer>
      }
    >
      <Text style={type.pageTitle}>{storyboard.title}</Text>
      <View style={styles.facts}>
        {facts.map((f) => (
          <Tag key={f} label={f} style={styles.fact} />
        ))}
      </View>
      <View style={styles.ready}>
        <Lock size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
        <Text style={metaInk}>
          <Trans t={t} ns="reels" i18nKey="storyboard.readyToRender" components={{ muted: <Text style={meta} /> }} />
        </Text>
      </View>

      <View style={{ gap: space[12], paddingTop: space[24] }}>
        {storyboard.scenes.map((s) => (
          <View key={s.n} style={styles.scene}>
            <View style={styles.sceneHead}>
              <Text style={strong14}>{t("scene.label", { n: s.n, seconds: s.seconds })}</Text>
              <Tag label={t(`shot.${s.shot}`)} />
            </View>
            <View style={{ gap: space[16], paddingTop: space[12] }}>
              <Image source={s.image} style={styles.still} contentFit="cover" accessibilityLabel={t(s.direction)} />
              <View>
                <Text style={eyebrow}>{t("storyboard.sceneDirection")}</Text>
                <Text style={type.body}>{t(s.direction)}</Text>
                <View style={styles.voice}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Volume2 size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                    <Text style={meta}>{t("storyboard.voiceoverFr")}</Text>
                  </View>
                  <Text style={[bodyMuted, { paddingTop: 2 }]}>{s.voiceover}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  productPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingVertical: 4,
    paddingHorizontal: space[12],
    borderRadius: radius.control,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#EEEDF7",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#1A1B22" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[8] },
  fact: { backgroundColor: "rgba(255,255,255,0.95)", paddingHorizontal: space[12], boxShadow: "0 1px 3px rgba(0,0,0,0.02)" },
  ready: {
    marginTop: space[12],
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingVertical: space[8],
    paddingHorizontal: space[12],
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
  },
  scene: { padding: space[16], backgroundColor: color.surface, borderWidth: 1, borderColor: rc.border, borderRadius: radius.card },
  sceneHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  still: { height: 198, borderRadius: radius.control, borderWidth: 1, borderColor: "#E8E7F1", backgroundColor: "#EEEDF7" },
  voice: { marginTop: space[8], padding: space[12], borderRadius: radius.control, backgroundColor: rc.softPanel },
  sep: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" },
});
