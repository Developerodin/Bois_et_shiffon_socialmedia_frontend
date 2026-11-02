import { useState } from "react";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Lock, RefreshCw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { currentBrand } from "@/api/endpoints";
import { formatDate } from "@/i18n";
import { color, radius, space, type } from "@/theme/tokens";
import { connectSocial } from "@/ui/connect-social";
import { coverUrl, usePost } from "@/ui/posts/use-posts";
import { ActionButton, ICON, meta, strong14 } from "@/ui/reels/kit";
import { SheetBackdrop, rx } from "@/ui/recovery/parts";
import { Sheet } from "@/ui/recovery/sheet";

/** The accounts the app can sign in to again (A12's flow); others reconnect from the web app. */
const NETWORK = { INSTAGRAM: "Instagram", META: "Facebook" } as const;
type Network = keyof typeof NETWORK;

/**
 * X03 · Recovery / Reconnect account: sheet over P05 Schedule when the post's account is linked but its sign-in
 * expired (connection status ERROR). Reconnecting runs the same consent flow as onboarding A12; the server updates
 * the existing account, so Schedule unlocks when the person comes back. Nothing is posted from here.
 */
export default function Reconnect() {
  const { t } = useTranslation("recovery");
  const p = useLocalSearchParams<{ id?: string; provider?: string }>();
  const provider: Network = p.provider === "META" ? "META" : "INSTAGRAM";
  const { post } = usePost(p.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/posts"));
  const title = t("reconnect.title", { network: NETWORK[provider] });
  const cover = post ? coverUrl(post) : null;

  const reconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await currentBrand();
      const names = await connectSocial(b.workspaceId, b.brandId, provider);
      if (names.length === 0) return; // closed the browser: stay here
      close(); // Schedule re-reads its accounts on focus
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <SheetBackdrop
        title={t("reconnect.backdropTitle")}
        card={post?.title ?? ""}
        meta={post?.scheduledFor ? t("reconnect.backdropMeta", { date: formatDate(post.scheduledFor, { month: "short", day: "numeric" }) }) : ""}
      />
      <Sheet onClose={close} label={title}>
        <View style={styles.icon}>
          <InstagramGlyph />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.body}>{t("reconnect.body")}</Text>

        {post ? (
          <View style={styles.draft}>
            <Image source={cover ? { uri: cover } : undefined} style={styles.thumb} contentFit="cover" accessibilityLabel={post.title} />
            <View style={{ flex: 1 }}>
              <Text style={strong14} numberOfLines={1}>
                {post.title}
              </Text>
              <Text style={meta}>{t("reconnect.draftSaved")}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.note}>
          <Lock size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
          <Text style={[type.meta, { flex: 1 }]}>{t("reconnect.noPosting")}</Text>
        </View>

        {error ? <Text style={[type.meta, { color: color.error, paddingTop: space[12] }]}>{error}</Text> : null}
        <View style={{ gap: space[12], paddingTop: space[24] }}>
          <ActionButton label={busy ? t("reconnect.reconnecting") : title} leading={RefreshCw} disabled={busy} onPress={() => void reconnect()} />
          <ActionButton label={t("reconnect.saveForLater")} variant="outline" onPress={close} />
        </View>
      </Sheet>
    </View>
  );
}

/** Lucide dropped brand marks, so the Instagram outline is drawn here at Lucide's 24-grid and stroke. */
function InstagramGlyph({ size = 24, ink = color.inkSecondary }: { size?: number; ink?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={ICON.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={2} y={2} width={20} height={20} rx={5} />
      <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <Circle cx={17.5} cy={6.5} r={0.5} fill={ink} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DED9E6" },
  title: { ...type.feature, fontSize: 16, lineHeight: 22, paddingTop: space[24] },
  body: { ...type.body, color: color.inkSecondary, paddingTop: space[8] },
  draft: {
    marginTop: space[20],
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    padding: space[12],
    borderRadius: radius.control,
    backgroundColor: rx.well,
    borderWidth: 1,
    borderColor: rx.hairline,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.nested },
  note: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[20] },
});
