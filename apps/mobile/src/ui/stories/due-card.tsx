import * as SecureStore from "expo-secure-store";
import { CalendarClock } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import type { DueStory } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { color, radius, space, type } from "@/theme/tokens";
import { openStory } from "@/ui/stories/use-stories";
import { useCurrentBrand } from "@/ui/use-current-brand";

const DAY_MS = 24 * 3600_000;
const keyFor = (brandId: string) => `espanda.storiesDueDismissed.${brandId}`;

/**
 * Stories due to be posted by hand (Today and P07): one card with a count, until someone posts them or stops Post by
 * hand. Dismiss hides it on this phone for a day, per business (SecureStore; if that fails it stays hidden until the
 * screen reloads). One story opens it; several open `onOpenMany` (P07's Scheduled tab).
 */
export function DueCard({ items, onOpenMany }: { items: DueStory[]; onOpenMany: () => void }) {
  const { t } = useTranslation("posts");
  const brandId = useCurrentBrand()?.id;
  // Whether the card is shown, for the business it was read for: hidden until that business's dismissal is known.
  const [shown, setShown] = useState<{ brandId: string; show: boolean } | null>(null);
  useEffect(() => {
    if (!brandId) return;
    let live = true;
    SecureStore.getItemAsync(keyFor(brandId)).then(
      (v) => live && setShown({ brandId, show: Date.now() - (Number(v) || 0) >= DAY_MS }),
      () => live && setShown({ brandId, show: true }),
    );
    return () => void (live = false);
  }, [brandId]);

  if (!items.length || !brandId || shown?.brandId !== brandId || !shown.show) return null;
  const dismiss = () => {
    setShown({ brandId, show: false });
    SecureStore.setItemAsync(keyFor(brandId), String(Date.now())).catch(() => {});
  };
  const n = items.length;
  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={t("stories.due.label")}>
      <View style={styles.row}>
        <CalendarClock size={18} color={color.ink} strokeWidth={1.75} />
        <View style={{ flex: 1 }}>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("stories.due.title", { count: n })}</Text>
          {n === 1 ? (
            <Text style={type.meta} numberOfLines={1}>
              {items[0].title}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.row}>
        <Button label={t("stories.due.open")} height={44} style={{ flex: 1 }} onPress={() => (n === 1 ? openStory(items[0].id) : onOpenMany())} />
        <Button label={t("stories.due.dismiss")} variant="outline" height={44} style={{ flex: 1 }} onPress={dismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space[16], padding: space[16], gap: space[12], backgroundColor: "#FFF8E6", borderWidth: 1, borderColor: "#F2DDA4", borderRadius: radius.control },
  row: { flexDirection: "row", alignItems: "center", gap: space[12] },
});
