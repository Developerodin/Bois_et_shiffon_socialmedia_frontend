import { Image } from "expo-image";
import { Redirect, router } from "expo-router";
import { ArrowRight, BadgeCheck, Check, Clapperboard, Coins, Info } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { formatNumber } from "@/i18n";
import { color, radius, space, type } from "@/theme/tokens";
import { Footer } from "@/ui/layout";
import { CloseButton, IconDisc } from "@/ui/plans/kit";
import { usePlan } from "@/ui/plans/use-plan";
import { useReel } from "@/ui/reels/use-reel";
import { ActionButton, BrandPill, ICON, PageHeader, Panel, ReelsScreen, Tag, eyebrow, metaInk, strong14 } from "@/ui/reels/kit";

/** L04 · No subscription / Activation return — back from the store with a live plan. */
export default function ActivationReturn() {
  const { t } = useTranslation("plans");
  const home = () => router.replace("/reels");
  const { loaded, plan: active } = usePlan();
  const plan = active ? t(`plans.${active.id}`) : "";
  const credits = { count: active?.credits ?? 0, n: formatNumber(active?.credits ?? 0) };
  // The open reel still waiting for its video, if any.
  const { detail } = useReel();
  const pending = detail?.plan && !detail.videoUrl ? detail : null;
  const price = pending?.price ?? 0;
  const cover = pending?.plan ? pending.photoUrls[pending.plan.scenes[0]?.photoKey] : undefined;
  // Opened with no plan behind it (a stale link, or Continue on Plans before purchases exist): nothing was activated.
  if (!loaded) return null;
  if (!active) return <Redirect href="/reels" />;
  return (
    <ReelsScreen
      header={<PageHeader left={<BrandPill tone="white" />} right={<CloseButton onPress={home} />} />}
      footer={
        <Footer>
          {pending ? (
            <ActionButton label={t("activated.continueReel", { count: price, n: formatNumber(price) })} trailing={ArrowRight} onPress={() => router.replace("/reels/storyboard")} />
          ) : (
            <ActionButton label={t("activated.makeReel")} trailing={ArrowRight} onPress={() => router.replace("/reels/chat")} />
          )}
          <ActionButton label={t("activated.backToWorkspace")} variant="outline" onPress={home} />
        </Footer>
      }
    >
      <View style={{ alignItems: "center" }}>
        <View style={styles.ring}>
          <View style={styles.badge}>
            <Check size={24} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />
          </View>
        </View>
        <Text accessibilityRole="header" style={[type.pageTitle, { paddingTop: space[20] }]}>
          {t("activated.title")}
        </Text>
        <Text style={styles.lead}>{t("activated.lead", { plan, ...credits })}</Text>
      </View>

      <Panel style={{ marginTop: space[24], padding: space[16] }}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={[styles.row, { gap: space[12] }]}>
              <Text style={[type.cardTitle, { fontSize: 15, lineHeight: 20 }]}>{t("activated.planName", { plan })}</Text>
              <View style={styles.active}>
                <View style={styles.activeDot} />
                <Text style={[type.meta, { color: color.inkSecondary }]}>{t("activated.active")}</Text>
              </View>
            </View>
            <Text style={[type.meta, { paddingTop: 4 }]}>{t("activated.renews", { plan })}</Text>
          </View>
          <IconDisc size={32}>
            <BadgeCheck size={18} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </IconDisc>
        </View>
        <View style={styles.balance}>
          <IconDisc style={{ backgroundColor: color.surface, boxShadow: "0 1px 4px rgba(16,16,20,0.08)" }}>
            <Coins size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </IconDisc>
          <Text style={[metaInk, { flex: 1 }]}>{t("activated.available")}</Text>
          <Text style={strong14}>{t("credits", credits)}</Text>
        </View>
      </Panel>

      {pending?.plan ? (
      <Panel style={{ marginTop: space[16], padding: space[16] }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Text style={eyebrow}>{t("activated.resumeProject")}</Text>
          <Tag label={t("activated.inProgress")} tone="grey" style={{ borderWidth: 0, paddingVertical: 4 }} textStyle={{ color: color.ink }} />
        </View>
        <View style={styles.project}>
          <Image source={cover ? { uri: cover } : undefined} style={styles.thumb} contentFit="cover" accessibilityLabel={pending.plan.scenes[0]?.shot} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={strong14}>{t("activated.reelTitle", { title: pending.plan.title })}</Text>
            <View style={[styles.row, { gap: space[8] }]}>
              <Clapperboard size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
              <Text style={type.meta}>{t("activated.scenesReady", { count: pending.plan.scenes.length, n: formatNumber(pending.plan.scenes.length) })}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.row, { gap: space[8], alignItems: "flex-start", paddingTop: space[16] }]}>
          <Info size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} style={{ marginTop: 3 }} />
          <Text style={[type.body, { flex: 1, color: color.inkSecondary }]}>{t("activated.noDeduction")}</Text>
        </View>
      </Panel>
      ) : null}
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  ring: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: color.surface, borderWidth: 1, borderColor: "#EAE8F2" },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#101014" },
  lead: { ...type.body, color: color.inkSecondary, textAlign: "center", paddingTop: space[12], paddingHorizontal: space[16] },
  active: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: space[8],
    borderRadius: radius.badge,
    backgroundColor: "#EBF7EE",
    borderWidth: 1,
    borderColor: "#D5EED9",
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#D5EED9" },
  balance: {
    marginTop: space[16],
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingVertical: space[12],
    paddingHorizontal: space[16],
    borderRadius: radius.control,
    backgroundColor: "#FBFAFD",
    borderWidth: 1,
    borderColor: "#EAE8F2",
  },
  project: {
    marginTop: space[12],
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    padding: space[8],
    borderRadius: radius.control,
    backgroundColor: "#FBF8FF",
    borderWidth: 1,
    borderColor: "#EAE8F7",
  },
  thumb: { width: 64, height: 64, borderRadius: radius.nested },
});
