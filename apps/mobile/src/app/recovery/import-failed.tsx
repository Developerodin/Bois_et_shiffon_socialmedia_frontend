import { Image } from "expo-image";
import { router } from "expo-router";
import { Info, RefreshCw, Unplug } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, radius, space, type } from "@/theme/tokens";
import { Footer, Label } from "@/ui/layout";
import { ActionButton, ICON, Panel } from "@/ui/reels/kit";
import { ErrorHero, RecoveryTopBar, rx } from "@/ui/recovery/parts";
import { importFailure as f, photos } from "@/ui/recovery/sample";

/** Quick options: recovery.json "importFailed.options.<key>". */
const OPTIONS = ["retry", "manual"] as const;

/** X04 · Recovery / Website import failed (onboarding step 2). */
export default function ImportFailed() {
  const { t } = useTranslation("recovery");
  const retry = () => router.replace("/onboarding/website");
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <RecoveryTopBar
        onBack={() => (router.canGoBack() ? router.back() : retry())}
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
            <Image source={photos.bcFavicon} style={{ width: 16, height: 16, borderRadius: 3 }} contentFit="contain" />
            <Text style={[type.label, { flex: 1 }]} numberOfLines={1}>
              {f.url}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t("importFailed.changeUrlA11y")} onPress={retry} style={styles.change}>
              <Text style={type.label}>{t("importFailed.changeUrl")}</Text>
            </Pressable>
          </View>
          <View style={styles.reason}>
            <Info size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            <Text style={[type.meta, { flex: 1 }]}>{t(`importFailed.reasons.${f.reason}`)}</Text>
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
        <ActionButton label={t("importFailed.tryAgain")} leading={RefreshCw} onPress={retry} />
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
