import { router } from "expo-router";
import { Check, CircleCheck, Download, Hash, Lock, SlidersHorizontal, Star, Video } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { rememberBrand, type SocialProvider } from "@/api/endpoints";
import { connectSocial } from "@/ui/connect-social";
import { Button } from "@/ui/button";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { BrandLogo } from "@/ui/onboarding/brand-logo";
import { clearOnboarding, GOAL_HOME, onboarding } from "@/ui/onboarding/state";
import { useBrandAssets } from "@/ui/onboarding/use-brand-assets";
import { color, radius, space, type } from "@/theme/tokens";

/** A12 · Onboarding / Connect Instagram (Figma 408:896) with A13 "Connect later?" sheet (408:981). */
export default function Connect() {
  const { t } = useTranslation("onboarding");
  const [skipSheet, setSkipSheet] = useState(false);
  const finish = () => {
    const home = GOAL_HOME[onboarding.goal];
    // The rest of the app works on the business just set up.
    if (onboarding.workspaceId && onboarding.brandId) rememberBrand({ workspaceId: onboarding.workspaceId, brandId: onboarding.brandId });
    clearOnboarding();
    router.replace(home);
  };
  const { data: brand } = useBrandAssets();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const connect = async (provider: SocialProvider) => {
    setSkipSheet(false);
    setFailed(null);
    setBusy(provider);
    try {
      const { workspaceId: ws, brandId } = onboarding;
      if (!ws || !brandId) throw new Error(t("connect.errors.noBrand"));
      const names = await connectSocial(ws, brandId, provider);
      setConnected((c) => [...new Set([...c, ...names])]);
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      header={<StepHeader step={5} />}
      footer={
        <>
          {failed ? (
            <Text accessibilityRole="alert" style={[type.meta, { color: color.error, textAlign: "center" }]}>
              {failed}
            </Text>
          ) : null}
          {connected.length ? (
            <>
              <View style={styles.connected} accessibilityLiveRegion="polite">
                <Check size={16} color={color.ink} strokeWidth={2} />
                <Text style={[type.meta, { color: color.ink, flex: 1 }]} numberOfLines={2}>
                  {t("connect.connectedAs", { names: connected.join(", ") })}
                </Text>
              </View>
              <Button label={t("common:continue")} arrow onPress={finish} />
            </>
          ) : null}
          <Button
            label={t("connect.connectInstagram")}
            variant={connected.length ? "outline" : "primary"}
            icon={require("../../../assets/figma/onboarding/logo-instagram.png")}
            loading={busy === "INSTAGRAM"}
            disabled={busy !== null}
            onPress={() => void connect("INSTAGRAM")}
          />
          <Button
            label={t("connect.connectFacebook")}
            variant="outline"
            icon={require("../../../assets/figma/onboarding/logo-facebook.png")}
            loading={busy === "META"}
            disabled={busy !== null}
            onPress={() => void connect("META")}
          />
          {connected.length ? null : <Button label={t("connect.skip")} variant="ghost" height={56} onPress={() => setSkipSheet(true)} />}
        </>
      }
    >
      <View style={styles.brand}>
        <BrandLogo brand={brand} size={16} />
        <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{brand?.name ?? ""}</Text>
        <Text style={type.meta}>{t("connect.readyToConnect")}</Text>
      </View>

      <Title
        title={t("connect.title")}
        subtitle={t("connect.subtitle")}
        style={{ paddingTop: space[16] }}
      />

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <CircleCheck size={16} color={color.ink} strokeWidth={1.75} />
          <Text style={[type.meta, { color: color.ink, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 }]}>{t("connect.toolsTitle")}</Text>
        </View>
        <Feature icon={<Video size={16} color={color.ink} strokeWidth={1.75} />} text={t("connect.featureReels")} />
        <Feature icon={<Hash size={16} color={color.ink} strokeWidth={1.75} />} text={t("connect.featureCaptions")} />
        <Feature icon={<Star size={16} color={color.ink} strokeWidth={1.75} />} text={t("connect.featureReview")} big last />
      </View>

      <View style={styles.assure}>
        <Lock size={14} color={color.inkSecondary} strokeWidth={1.75} />
        <Text style={type.meta}>{t("connect.assurance")}</Text>
      </View>

      <Modal visible={skipSheet} transparent animationType="slide" onRequestClose={() => setSkipSheet(false)}>
        <Pressable style={styles.scrim} onPress={() => setSkipSheet(false)} accessibilityLabel={t("common:close")} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetBrand}>
            <BrandLogo brand={brand} size={14} />
            <Text style={[type.meta, { color: color.ink }]}>{brand?.name ?? ""}</Text>
          </View>
          <Text style={[type.pageTitle, { paddingTop: space[12] }]}>{t("connect.laterTitle")}</Text>
          <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[8] }]}>
            {t("connect.laterBody")}
          </Text>
          <View style={styles.tiles}>
            <Tile icon={<Download size={18} color={color.ink} strokeWidth={1.75} />} text={t("connect.laterDownload")} />
            <Tile icon={<SlidersHorizontal size={18} color={color.ink} strokeWidth={1.75} />} text={t("connect.laterSettings")} />
          </View>
          <Button label={t("connect.continueWithout")} onPress={() => { setSkipSheet(false); finish(); }} />
          <Button label={t("connect.connectInstagram")} variant="outline" style={{ marginTop: space[12] }} onPress={() => void connect("INSTAGRAM")} />
        </View>
      </Modal>
    </Screen>
  );
}

function Feature({ icon, text, big, last }: { icon: ReactNode; text: string; big?: boolean; last?: boolean }) {
  return (
    <View style={[styles.feature, !last && styles.featureRule]}>
      <View style={styles.featureIcon}>{icon}</View>
      <Text style={[big ? type.body : [type.meta, { color: color.ink }], { flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Tile({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={styles.tile}>
      {icon}
      <Text style={[type.meta, { color: color.ink, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: space[8], paddingHorizontal: space[12], backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: color.divider, borderRadius: radius.round },
  card: { padding: space[16], backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, borderRadius: radius.card },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space[8], paddingBottom: space[8] },
  feature: { flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[12] },
  featureRule: { borderBottomWidth: 1, borderBottomColor: color.divider },
  featureIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  assure: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: space[32] },
  scrim: { flex: 1, backgroundColor: "rgba(16,16,20,0.4)" },
  sheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space[24], paddingTop: space[12], paddingBottom: space[32] },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: color.disabledBg, marginBottom: space[16] },
  sheetBrand: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: space[4], paddingHorizontal: space[8], borderWidth: 1, borderColor: color.divider, borderRadius: radius.round },
  tiles: { flexDirection: "row", gap: space[12], paddingVertical: space[20] },
  connected: { flexDirection: "row", alignItems: "center", gap: space[8], padding: space[12], backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  tile: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[8], padding: space[12], borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
});
