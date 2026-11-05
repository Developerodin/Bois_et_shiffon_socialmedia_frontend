import { useEffect, useState } from "react";
import { Check } from "lucide-react-native";
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
  Settings,
  SlidersHorizontal,
  Unplug,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { Trans, useTranslation } from "react-i18next";
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDate, formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { bc, strong14 } from "@/ui/business/kit";
import { myBusinesses, signOut, switchBusiness, type Business } from "@/ui/account-actions";
import { resetTo } from "@/ui/reset-stack";
import { useCredits } from "@/ui/use-credits";
import { useCurrentBrand } from "@/ui/use-current-brand";
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
  const brand = useCurrentBrand();
  const balance = useCredits();
  const credits = formatNumber(balance ?? 0);
  const [x] = useState(() => new Animated.Value(-WIDTH));
  // The switcher's list: loaded when opened.
  const [list, setList] = useState<Business[] | null>(null);
  const [picking, setPicking] = useState(false);
  const togglePicking = () => {
    if (!picking && !list) myBusinesses().then(setList, () => setList([]));
    setPicking(!picking);
  };
  const pick = (b: Business) => {
    setPicking(false);
    if (b.brandId === brand?.id) return;
    switchBusiness(b);
    onClose();
    router.replace("/posts");
  };

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

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: picking }}
              accessibilityLabel={t("drawer.switchLabel", { name: brand?.name ?? "" })}
              onPress={togglePicking}
              style={styles.switcher}
            >
              <Image source={brand?.logoUrl ? { uri: brand.logoUrl } : undefined} style={styles.favicon} contentFit="contain" />
              <Text style={[strong14, { flex: 1 }]} numberOfLines={1}>
                {brand?.name ?? ""}
              </Text>
              <ChevronDown size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} style={picking ? { transform: [{ rotate: "180deg" }] } : undefined} />
            </Pressable>
            {picking ? (
              <View style={styles.picker}>
                {!list ? (
                  <Text style={[meta, { padding: space[8] }]}>{t("drawer.loadingBusinesses")}</Text>
                ) : (
                  list.map((b) => (
                    <Pressable key={b.brandId} accessibilityRole="button" accessibilityState={{ selected: b.brandId === brand?.id }} onPress={() => pick(b)} style={styles.pickRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={type.label} numberOfLines={1}>
                          {b.name}
                        </Text>
                        <Text style={meta} numberOfLines={1}>
                          {b.site ?? t("drawer.added", { date: formatDate(b.createdAt, { day: "numeric", month: "short", year: "numeric" }) })}
                        </Text>
                      </View>
                      {b.brandId === brand?.id ? <Check size={16} color={color.primary} strokeWidth={ICON.strokeWidth} /> : null}
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("drawer.balanceLabelNoPlan", { count: balance ?? 0, credits })}
              onPress={() => go("/business/billing")}
              style={styles.balance}
            >
              <View style={{ flex: 1 }}>
                <Text style={eyebrow}>{t("drawer.balanceTitle")}</Text>
                <Text>
                  <Trans t={t}
                    ns="business"
                    i18nKey="drawer.creditsLeft"
                    count={balance ?? 0}
                    values={{ credits }}
                    components={{ amount: <Text style={type.cardTitle} />, rest: <Text style={meta} /> }}
                  />
                </Text>
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
            <Pressable accessibilityRole="button" accessibilityLabel={t("drawer.signOut")} onPress={() => void signOut().then(() => (onClose(), resetTo("/onboarding/sign-in")))} style={styles.signOut}>
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
  picker: { marginTop: -4, paddingVertical: 4, borderRadius: radius.control, backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider },
  pickRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space[8], paddingHorizontal: space[12] },
  list: { paddingHorizontal: space[20], paddingBottom: space[16] },
  sectionTitle: { paddingBottom: 4 },
  item: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: space[12], paddingHorizontal: 4, borderRadius: radius.nested },
  foot: { paddingTop: space[12], paddingHorizontal: space[20], backgroundColor: "rgba(255,255,255,0.6)", borderTopWidth: 1, borderTopColor: "#EBEBEF" },
  signOut: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space[12], alignSelf: "flex-start", paddingHorizontal: 4 },
});
