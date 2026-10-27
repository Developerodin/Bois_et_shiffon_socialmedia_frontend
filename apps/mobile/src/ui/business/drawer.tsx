import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import {
  Bot,
  ChevronDown,
  Clapperboard,
  CreditCard,
  Images,
  LogOut,
  MapPinned,
  MessagesSquare,
  PanelsTopLeft,
  Settings,
  SlidersHorizontal,
  Unplug,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { Trans, useTranslation } from "react-i18next";
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { session } from "@/api/client";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { bc, strong14 } from "@/ui/business/kit";
import { business, drawerAccount, media } from "@/ui/business/sample";
import { ICON, eyebrow, meta } from "@/ui/reels/kit";
import { photos } from "@/ui/reels/sample";

const WIDTH = 316;

// Labels are keys under business:drawer (sections.<title>, items.<label>), translated at render.
type Item = { label: string; Icon: LucideIcon; href: Href };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "create",
    items: [
      { label: "chat", Icon: Bot, href: "/reels/chat" },
      { label: "generations", Icon: Clapperboard, href: "/reels/results" },
      { label: "photos", Icon: Images, href: "/business/photos" },
    ],
  },
  {
    title: "grow",
    items: [
      { label: "inbox", Icon: MessagesSquare, href: "/marketing/inbox" },
      { label: "google", Icon: MapPinned, href: "/marketing/google" },
      { label: "website", Icon: PanelsTopLeft, href: "/marketing/website" },
      { label: "connections", Icon: Unplug, href: "/business/connections" },
      { label: "automations", Icon: SlidersHorizontal, href: "/business/automations" },
    ],
  },
  {
    title: "manage",
    items: [
      { label: "billing", Icon: CreditCard, href: "/business/billing" },
      { label: "account", Icon: Settings, href: "/business/account" },
    ],
  },
];

/**
 * M13 · Navigation / Business drawer: a 316-wide panel that slides in from the left over a
 * faded backdrop. `onSelect` defaults to close-then-push; the /business/menu route swaps it for
 * a replace so the menu screen doesn't stay in history.
 */
export function BusinessDrawer({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect?: (href: Href) => void }) {
  const { t } = useTranslation("business");
  const { top, bottom } = useSafeAreaInsets();
  const credits = formatNumber(drawerAccount.credits);
  const [x] = useState(() => new Animated.Value(-WIDTH));

  useEffect(() => {
    if (!visible) return;
    x.setValue(-WIDTH);
    Animated.timing(x, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  }, [visible, x]);

  const go = (href: Href) => {
    if (onSelect) return onSelect(href);
    onClose();
    router.push(href);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("drawer.closeMenu")} />
        <Animated.View style={[styles.panel, { transform: [{ translateX: x }] }]} accessibilityViewIsModal>
          <View style={[styles.top, { paddingTop: top + space[20] }]}>
            <View style={styles.brandRow}>
              <Image source={photos.logo} style={{ width: 112, height: 33 }} contentFit="contain" accessibilityLabel="Espanda" />
              <Pressable accessibilityRole="button" accessibilityLabel={t("drawer.closeMenu")} onPress={onClose} style={styles.close}>
                <X size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel={t("drawer.switchLabel", { name: business.name })} style={styles.switcher}>
              <Image source={media.favicon} style={styles.favicon} contentFit="contain" />
              <Text style={[strong14, { flex: 1 }]}>{business.name}</Text>
              <ChevronDown size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("drawer.balanceLabel", { count: drawerAccount.credits, credits, plan: drawerAccount.plan })}
              onPress={() => go("/business/billing")}
              style={styles.balance}
            >
              <View style={{ flex: 1 }}>
                <Text style={eyebrow}>{t("drawer.balanceTitle")}</Text>
                <Text>
                  <Trans t={t}
                    ns="business"
                    i18nKey="drawer.creditsLeft"
                    count={drawerAccount.credits}
                    values={{ credits }}
                    components={{ amount: <Text style={type.cardTitle} />, rest: <Text style={meta} /> }}
                  />
                </Text>
              </View>
              <View style={styles.planTag}>
                <Text style={strong14}>{drawerAccount.plan}</Text>
              </View>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
            {SECTIONS.map((s) => (
              <View key={s.title} style={{ paddingTop: space[16] }}>
                <Text style={[eyebrow, styles.sectionTitle]} accessibilityRole="header">
                  {t(`drawer.sections.${s.title}`)}
                </Text>
                {s.items.map(({ label, Icon, href }) => (
                  <Pressable
                    key={label}
                    accessibilityRole="link"
                    accessibilityLabel={t(`drawer.items.${label}`)}
                    onPress={() => go(href)}
                    style={({ pressed }) => [styles.item, pressed && { backgroundColor: "rgba(16,16,20,0.04)" }]}
                  >
                    <Icon size={20} color={color.disabledInk} strokeWidth={ICON.strokeWidth} />
                    <Text style={[type.label, { fontFamily: font.regular }]}>{t(`drawer.items.${label}`)}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={[styles.foot, { paddingBottom: bottom + space[12] }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("drawer.signOut")} onPress={() => void session.signOut().then(() => go("/onboarding/sign-in"))} style={styles.signOut}>
              <LogOut size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
              <Text style={strong14}>{t("drawer.signOut")}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(248,248,250,0.6)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: WIDTH,
    backgroundColor: "#F8F8FA",
    boxShadow: "8px 0 32px rgba(16,16,20,0.08)",
  },
  top: {
    paddingHorizontal: space[20],
    paddingBottom: space[12],
    backgroundColor: "rgba(255,255,255,0.8)",
    borderBottomWidth: 1,
    borderBottomColor: "#EBEBEF",
    gap: space[12],
  },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -6, marginBottom: 2 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -6 },
  switcher: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingHorizontal: 9,
    paddingRight: space[16],
    borderRadius: radius.control,
    backgroundColor: bc.tileSoft,
    borderWidth: 1,
    borderColor: color.divider,
  },
  favicon: { width: 16, height: 16, borderRadius: 3, backgroundColor: bc.black },
  balance: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingVertical: space[12],
    paddingLeft: space[12],
    paddingRight: space[12],
    borderRadius: radius.control,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
  },
  planTag: { height: 26, justifyContent: "center", paddingHorizontal: space[8], borderRadius: radius.badge, backgroundColor: bc.tile, borderWidth: 1, borderColor: color.divider },
  list: { paddingHorizontal: space[20], paddingBottom: space[16] },
  sectionTitle: { paddingBottom: 4 },
  item: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: space[12], paddingHorizontal: 4, borderRadius: radius.nested },
  foot: { paddingTop: space[12], paddingHorizontal: space[20], backgroundColor: "rgba(255,255,255,0.6)", borderTopWidth: 1, borderTopColor: "#EBEBEF" },
  signOut: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space[12], alignSelf: "flex-start", paddingHorizontal: 4 },
});
