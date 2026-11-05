import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { Camera, Globe, MessageCircle, ShoppingBag, Store, type LucideIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { connections, disconnectAccount, type Connection, type SocialProvider } from "@/api/endpoints";
import { color, radius, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, IconTile, SectionHead, SettingsCard, SmallButton, TextAction, bc, strong14 } from "@/ui/business/kit";
import { connectSocial } from "@/ui/connect-social";
import { siteLabel, useCurrentBrand } from "@/ui/use-current-brand";
import { ICON, Tag, meta } from "@/ui/reels/kit";

/**
 * The design's channels. `provider`: the server's account type the app can sign in to (onboarding A12's flow);
 * Shopify connects with an Admin API token on the web, so here it only shows its status. The others have no
 * connector yet and say so. ponytail: Pinterest/Threads connect from the web app for now.
 */
const CHANNELS: { id: "instagram" | "facebook" | "whatsapp" | "google" | "shopify"; Icon: LucideIcon; provider?: SocialProvider | "SHOPIFY"; primary?: boolean }[] = [
  { id: "instagram", Icon: Camera, provider: "INSTAGRAM", primary: true },
  { id: "facebook", Icon: Globe, provider: "META" },
  { id: "whatsapp", Icon: MessageCircle },
  { id: "google", Icon: Store, provider: "GOOGLE_BUSINESS" },
  { id: "shopify", Icon: ShoppingBag, provider: "SHOPIFY" },
];
const GREY = color.disabledInk;

/**
 * M09 · Business / Connections: the website Research reads, and the accounts posts and reels go out to. Connect and
 * Reconnect run the same sign-in as onboarding A12; Disconnect makes the server forget the account.
 */
export default function Connections() {
  const { t } = useTranslation("business");
  const brand = useCurrentBrand();
  const [list, setList] = useState<Connection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    connections().then((r) => setList(r.connections), (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(load);
  const site = siteLabel(brand?.view?.website);

  const run = async (key: string, call: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await call();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const connect = (provider: SocialProvider) => run(provider, async () => brand && (await connectSocial(brand.workspaceId, brand.id, provider)));
  const disconnectAll = (accounts: Connection[]) =>
    run(accounts[0].id, async () => {
      for (const a of accounts) await disconnectAccount(a.id);
    });

  return (
    <BizScreen top={space[24]} header={<BrandHeader title={t("connections.title")} />}>
      <SectionHead title={t("connections.sourceTitle")} style={{ paddingBottom: space[8] }} />
      <SettingsCard style={[styles.row, { borderColor: color.divider }]}>
        <IconTile icon={Globe} tint={GREY} style={styles.siteTile} />
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={strong14}>{site ?? t("connections.noSite")}</Text>
            {site ? <Tag label={t("connections.linked")} tone="grey" /> : null}
          </View>
          <Text style={[meta, { paddingTop: 2 }]}>{t("connections.sourceBody")}</Text>
        </View>
        <View style={{ marginRight: space[8] }}>
          <TextAction label={t("connections.viewPhotos")} onPress={() => router.push("/business/photos")} />
        </View>
      </SettingsCard>

      <SectionHead title={t("connections.channelsTitle")} aside={t("connections.accounts")} style={{ marginTop: space[20], paddingBottom: space[8] }} />
      {error ? <Text style={[meta, { color: color.error, paddingBottom: space[8] }]}>{error}</Text> : null}
      {!list && !error ? <ActivityIndicator color={color.primary} /> : null}
      <View style={{ gap: space[12] }}>
        {CHANNELS.map((c) => {
          // Linked accounts of this type (a person can link more than one Page); ERROR = its sign-in expired.
          const accounts = (list ?? []).filter((a) => a.provider === c.provider && a.status !== "REVOKED");
          const on = accounts.some((a) => a.status === "ACTIVE");
          const expired = !on && accounts.some((a) => a.status === "ERROR");
          const webOnly = c.provider === "SHOPIFY";
          const social = c.provider === "SHOPIFY" ? undefined : c.provider;
          const { Icon } = c;
          return (
            <SettingsCard key={c.id} style={[styles.row, styles.channel, c.primary && { minHeight: 106 }]}>
              {c.id === "instagram" ? (
                <LinearGradient
                  colors={["rgba(253,29,29,0.1)", "rgba(225,48,108,0.1)", "rgba(64,93,230,0.1)"]}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.tile, styles.instagram]}
                >
                  <Icon size={20} color={GREY} strokeWidth={ICON.strokeWidth} />
                </LinearGradient>
              ) : (
                <IconTile icon={Icon} tint={GREY} style={{ marginRight: 4 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={strong14}>{t(`connections.channels.${c.id}`)}</Text>
                <View style={styles.status}>
                  <View style={[styles.dot, on && { backgroundColor: "#12B76A" }, expired && { backgroundColor: color.error }]} />
                  <Text style={meta} numberOfLines={1}>
                    {!c.provider
                      ? t("connections.comingSoon")
                      : on
                        ? accounts.map((a) => a.displayName).join(", ")
                        : expired
                          ? t(webOnly ? "connections.reconnectOnWeb" : "connections.expired")
                          : t(webOnly ? "connections.connectOnWeb" : "connections.notConnected")}
                  </Text>
                </View>
              </View>
              {social ? (
                busy === social || accounts.some((a) => busy === a.id) ? (
                  <ActivityIndicator color={color.primary} />
                ) : (
                  <SmallButton
                    label={on ? t("connections.disconnect") : expired ? t("connections.reconnect") : t("connections.connect")}
                    primary={(c.primary && !on) || expired}
                    onPress={() => void (on ? disconnectAll(accounts) : connect(social))}
                  />
                )
              ) : null}
            </SettingsCard>
          );
        })}
      </View>
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[12] },
  channel: { borderColor: color.divider, minHeight: 86, paddingVertical: space[16], gap: space[8] },
  siteTile: { width: 38, borderRadius: radius.control, backgroundColor: bc.tile },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[8], flexWrap: "wrap" },
  tile: { marginRight: 4, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  instagram: { borderWidth: 1, borderColor: "rgba(225,48,108,0.15)" },
  status: { flexDirection: "row", alignItems: "center", gap: space[4], paddingTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: bc.dot },
});
