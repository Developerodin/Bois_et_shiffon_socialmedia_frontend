import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Lock, MapPinPlus, RefreshCw, SquarePen, Star, Store, type LucideIcon } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { google } from "@/api/endpoints";
import { connectSocial } from "@/ui/connect-social";
import { useCurrentBrand } from "@/ui/use-current-brand";
import { useTranslation } from "react-i18next";
import { color, space, type } from "@/theme/tokens";
import { Divider, TextButton, TitleHeader, mc, title16 } from "@/ui/marketing/kit";
import { ActionButton, BrandPill, ICON, Panel, ReelsScreen, bodyMuted, eyebrow, meta, rc, strong14 } from "@/ui/reels/kit";

const CAPABILITIES = ["catalog", "reviews", "replies"] as const;
const CAPABILITY_ICON: Record<(typeof CAPABILITIES)[number], LucideIcon> = {
  catalog: Store,
  reviews: Star,
  replies: SquarePen,
};

/**
 * M04 · Google Growth / Setup. "Connect" signs in to Google (Business Profile access) and lands on the workspace (M14);
 * a brand that's already connected goes straight there.
 */
export default function GoogleSetup() {
  const { t } = useTranslation("marketing");
  const brand = useCurrentBrand();
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useCallback(() => {
    setChecking(true);
    setError(null);
    google.get().then(
      (r) => (r.profile.connected ? router.replace("/marketing/google-workspace") : setChecking(false)),
      (e: unknown) => {
        setChecking(false);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  }, []);
  useFocusEffect(check);
  const connect = async () => {
    if (!brand) return;
    setBusy(true);
    setError(null);
    try {
      if ((await connectSocial(brand.workspaceId, brand.id, "GOOGLE_BUSINESS")).length) router.replace("/marketing/google-workspace");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ReelsScreen
      bg={color.canvas}
      glow={false}
      header={<TitleHeader title={t("shared.googleGrowth")} right={<BrandPill tone="white" />} />}
      contentStyle={{ paddingTop: space[16] }}
    >
      <Text style={type.pageTitle}>{t("google.presenceTitle")}</Text>
      <Text style={[bodyMuted, { paddingTop: 4 }]}>{t("google.presenceBody")}</Text>

      <Panel style={{ marginTop: space[24] }}>
        <View style={{ flexDirection: "row", gap: space[16] }}>
          <View style={styles.pin}>
            <MapPinPlus size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={title16}>{t("google.profileTitle")}</Text>
            <Text style={[meta, { paddingTop: 2 }]}>{t("shared.status.notConnected")}</Text>
            <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("google.profileBody")}</Text>
          </View>
        </View>
        <Divider style={{ marginVertical: space[16] }} />
        {error ? (
          <View style={{ paddingBottom: space[12] }}>
            <Text style={[meta, { color: color.error }]}>{error}</Text>
            <TextButton label={t("google.retry")} onPress={check} style={{ alignSelf: "flex-start" }} />
          </View>
        ) : null}
        {checking ? (
          <ActivityIndicator color={color.primary} />
        ) : (
          <ActionButton label={t("google.connectProfile")} leading={RefreshCw} disabled={busy || !brand} onPress={() => void connect()} />
        )}
        <Text style={[meta, { textAlign: "center", paddingTop: space[12] }]}>{t("google.connectNote")}</Text>
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <Text style={eyebrow}>{t("google.capabilitiesTitle")}</Text>
        <View style={{ gap: space[16], paddingTop: space[16] }}>
          {CAPABILITIES.map((id) => {
            const Icon = CAPABILITY_ICON[id];
            return (
              <View key={id} style={{ flexDirection: "row", gap: space[12] }}>
                <View style={styles.capIcon}>
                  <Icon size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={strong14}>{t(`google.capabilities.${id}.title`)}</Text>
                  <Text style={[bodyMuted, { paddingTop: 2 }]}>{t(`google.capabilities.${id}.body`)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Panel>

      {/* Below the frame's fold: the card's lock badge is visible, its copy is inferred. */}
      <Panel style={[styles.privacy, { marginTop: space[24] }]}>
        <View style={styles.lock}>
          <Lock size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
        </View>
        <Text style={[title16, { textAlign: "center", paddingTop: space[12] }]}>{t("google.controlTitle")}</Text>
        <Text style={[bodyMuted, { textAlign: "center", paddingTop: 4 }]}>{t("google.controlBody")}</Text>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  pin: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: rc.border },
  capIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: mc.iconCircle, alignItems: "center", justifyContent: "center", marginTop: 1 },
  privacy: { alignItems: "center" },
  lock: { width: 32, height: 32, borderRadius: 16, backgroundColor: mc.rowDivider, alignItems: "center", justifyContent: "center" },
});
