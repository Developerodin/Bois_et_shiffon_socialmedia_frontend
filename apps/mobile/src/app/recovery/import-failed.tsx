import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Globe, Info, RefreshCw, Unplug } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { checkSite } from "@/api/endpoints";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, radius, space, type } from "@/theme/tokens";
import { Footer, Label } from "@/ui/layout";
import { ActionButton, ICON, Panel } from "@/ui/reels/kit";
import { ErrorHero, RecoveryTopBar, rx } from "@/ui/recovery/parts";

/** Quick options: recovery.json "importFailed.options.<key>". */
const OPTIONS = ["retry", "manual"] as const;

/**
 * X04 · Recovery / Website import failed: onboarding A06's address didn't open (apps/web site-check). Try again checks
 * it once more and goes on to Learning if it opens now; Change URL goes back to A06; or the business is added by hand (A07).
 */
export default function ImportFailed() {
  const { t } = useTranslation("recovery");
  const { site = "" } = useLocalSearchParams<{ site?: string }>();
  const [checking, setChecking] = useState(false);
  const [stillDown, setStillDown] = useState<string | null>(null);
  const change = () => (router.canGoBack() ? router.back() : router.replace("/onboarding/website"));
  const retry = async () => {
    if (!site) return change();
    setChecking(true);
    setStillDown(null);
    try {
      const { ok } = await checkSite(site);
      if (ok) router.replace({ pathname: "/onboarding/learning", params: { site } });
      else setStillDown(t("importFailed.stillDown"));
    } catch (e) {
      setStillDown(e instanceof ApiError ? e.message : t("importFailed.stillDown"));
    } finally {
      setChecking(false);
    }
  };
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <RecoveryTopBar
        onBack={change}
        center={<Text style={[type.meta, { fontFamily: "Inter_600SemiBold" }]}>{t("step", { ns: "common", step: 2, total: 5 })}</Text>}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <ErrorHero
          Icon={Unplug}
          size={56}
          title={t("importFailed.title")}
          body={t("importFailed.body")}
        />

        <Panel style={styles.card}>
          <Label>{t("importFailed.urlLabel")}</Label>
          <View style={styles.url}>
            <Globe size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            <Text style={[type.label, { flex: 1 }]} numberOfLines={1}>
              {site.replace(/^https?:\/\//, "")}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t("importFailed.changeUrlA11y")} onPress={change} style={styles.change}>
              <Text style={type.label}>{t("importFailed.changeUrl")}</Text>
            </Pressable>
          </View>
          <View style={styles.reason}>
            <Info size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            <Text style={[type.meta, { flex: 1 }]} accessibilityLiveRegion="polite">
              {stillDown ?? t("importFailed.reason")}
            </Text>
          </View>
        </Panel>

        <View style={styles.options}>
          <Text style={type.body}>{t("importFailed.quickOptions")}</Text>
          {OPTIONS.map((o) => (
            <View key={o} style={styles.bullet}>
              <Text style={type.meta}>•</Text>
              <Text style={[type.meta, { flex: 1 }]}>{t(`importFailed.options.${o}`)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <Footer>
        <ActionButton label={checking ? t("importFailed.checking") : t("importFailed.tryAgain")} leading={RefreshCw} disabled={checking} onPress={() => void retry()} />
        <ActionButton label={t("importFailed.addManually")} variant="outline" onPress={() => router.replace("/onboarding/manual")} />
      </Footer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: rx.page },
  body: { paddingHorizontal: space[20], paddingTop: space[32], paddingBottom: space[24] },
  card: { marginTop: space[24], borderColor: rx.hairline },
  url: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    minHeight: 68,
    paddingLeft: space[16],
    paddingRight: space[4],
    borderRadius: radius.control,
    backgroundColor: rx.well,
    borderWidth: 1,
    borderColor: "#F0EFF4",
  },
  change: { minHeight: 44, justifyContent: "center", paddingHorizontal: space[4] },
  reason: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[16] },
  options: { marginTop: space[16], padding: space[16], gap: space[8], borderRadius: radius.control, borderWidth: 1, borderColor: rx.hairline },
  bullet: { flexDirection: "row", gap: space[8], paddingLeft: space[4] },
});
