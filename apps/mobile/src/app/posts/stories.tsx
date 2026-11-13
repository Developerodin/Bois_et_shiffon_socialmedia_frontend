import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { catalog, stories, type Product, type StoryGoal, type StoryTab } from "@/api/endpoints";
import { thumbUrl } from "@/ui/business/products";
import { Button } from "@/ui/button";
import { PageLoading } from "@/ui/page-loading";
import { Field } from "@/ui/field";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BottomNav, BusinessSwitcher, ModuleHeader, PostsScreen } from "@/ui/posts/chrome";
import { CardTitle, Pill, tint } from "@/ui/posts/controls";
import { Sheet } from "@/ui/recovery/sheet";
import { StoryCard } from "@/ui/stories/card";
import { DueCard } from "@/ui/stories/due-card";
import { storyError } from "@/ui/stories/errors";
import { useStories, type StoryCard as Card } from "@/ui/stories/use-stories";
import { useCurrentBrand } from "@/ui/use-current-brand";
import { usePermissions } from "@/ui/use-permissions";

const plus = require("../../../assets/figma/posts/btn-plus-white.svg");
const TABS: StoryTab[] = ["drafts", "scheduled", "posted"];
const GOALS: StoryGoal[] = ["newArrival", "productFeature", "specialOffer"];
const STORY_CREDITS = 5; // CREDIT_COSTS.storyWrite on the server

/** A v4 uuid for the New story request (the server takes each one once, so a retried tap can't pay twice). */
const requestId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

/** P07 · Posts / Stories: the business's stories in Drafts, Scheduled and Posted, and New story. */
export default function Stories() {
  const { t } = useTranslation("posts");
  const { tabs, due, loading, error, refresh } = useStories();
  const { can } = usePermissions();
  const [tab, setTab] = useState<StoryTab>("drafts");
  // One request id per sheet open; null = closed.
  const [sheet, setSheet] = useState<string | null>(null);
  const openSheet = () => setSheet(requestId());
  const total = tabs.drafts.length + tabs.scheduled.length + tabs.posted.length;
  const shown = tabs[tab];
  const pairs: Card[][] = [];
  for (let i = 0; i < shown.length; i += 2) pairs.push(shown.slice(i, i + 2));

  return (
    <PostsScreen header={<ModuleHeader />} nav={<BottomNav active="stories" />}>
      <View style={{ height: 56 }}>
        <BusinessSwitcher />
      </View>
      <View style={styles.titleRow}>
        <View style={{ flexShrink: 1 }}>
          <Text style={type.pageTitle} accessibilityRole="header">
            {t("stories.title")}
          </Text>
          <Text style={type.meta}>{t("stories.subtitle")}</Text>
        </View>
        {can("content.create") ? <Button label={t("stories.newStory")} icon={plus} onPress={openSheet} /> : null}
      </View>

      <DueCard items={due} onOpenMany={() => setTab("scheduled")} />

      {loading ? <PageLoading rows={2} photo /> : null}
      {error ? (
        <View style={styles.state}>
          <Text style={type.body}>{t("stories.loadFailed")}</Text>
          <Button label={t("stories.retry")} variant="outline" onPress={() => void refresh()} />
        </View>
      ) : null}
      {!loading && !error && total === 0 ? (
        <View style={styles.state}>
          <Text style={type.cardTitle}>{t("stories.empty")}</Text>
          <Text style={[type.body, { color: color.inkSecondary }]}>{t("stories.emptyBody")}</Text>
          {can("content.create") ? <Button label={t("stories.newStory")} icon={plus} onPress={openSheet} /> : null}
        </View>
      ) : null}

      {!loading && !error && total > 0 ? (
        <>
          <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel={t("stories.statusLabel")}>
            {TABS.map((k) => (
              <Pill key={k} label={t(`stories.${k}`, { count: tabs[k].length })} selected={tab === k} onPress={() => setTab(k)} />
            ))}
          </View>
          {shown.length === 0 ? <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[16] }]}>{t("stories.tabEmpty")}</Text> : null}
          {pairs.map((pair) => (
            <View key={pair[0].id} style={styles.grid}>
              {pair.map((s) => (
                <StoryCard key={s.id} story={s} onChanged={() => void refresh()} />
              ))}
              {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </>
      ) : null}

      {sheet ? (
        <NewStorySheet
          requestId={sheet}
          onClose={() => setSheet(null)}
          onCreated={() => {
            setSheet(null);
            setTab("drafts");
            void refresh();
          }}
        />
      ) : null}
    </PostsScreen>
  );
}

/** New story: product, goal and direction; the agent writes it for 5 credits. */
function NewStorySheet({ requestId, onClose, onCreated }: { requestId: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation("posts");
  const brand = useCurrentBrand();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [goal, setGoal] = useState<StoryGoal>("newArrival");
  const [direction, setDirection] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);

  useEffect(() => {
    if (!brand) return;
    const ctrl = new AbortController();
    catalog.list(brand.workspaceId, brand.id, ctrl.signal).then(
      (r) => {
        // The writer makes frames from the product's photos, so only products with one can start a story.
        const withPhoto = r.products.filter((p) => p.imageUrl);
        setProducts(withPhoto);
        setProductId((id) => id ?? withPhoto[0]?.id ?? null);
      },
      (e: unknown) => !ctrl.signal.aborted && setError({ text: storyError(e), credits: false }),
    );
    return () => ctrl.abort();
  }, [brand?.id, brand?.workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!productId) return;
    setSending(true);
    setError(null);
    try {
      await stories.create(requestId, { goal, productId, direction: direction.trim() || undefined });
      onCreated();
    } catch (e) {
      setError({ text: storyError(e), credits: e instanceof ApiError && e.code === "story.credits" });
      setSending(false);
    }
  };

  return (
    <Sheet onClose={sending ? () => {} : onClose} label={t("stories.newStory")} scrim="rgba(10,10,12,0.4)">
      <Text style={type.feature} accessibilityRole="header">
        {t("stories.newStory")}
      </Text>
      <Text style={[type.meta, { paddingTop: 2 }]}>{t("stories.newStoryBody")}</Text>

      <CardTitle style={styles.label}>{t("stories.product")}</CardTitle>
      {!products ? (
        error ? null : <PageLoading rows={1} photo style={{ marginTop: 0 }} />
      ) : products.length === 0 ? (
        <View style={{ gap: space[8] }}>
          <Text style={type.meta}>{t("stories.noProducts")}</Text>
          <Button label={t("stories.openProducts")} variant="outline" height={44} onPress={() => (onClose(), router.push("/business/products"))} />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.products} accessibilityRole="radiogroup" accessibilityLabel={t("stories.product")}>
          {products.map((p) => {
            const on = p.id === productId;
            return (
              <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={p.title} onPress={() => setProductId(p.id)} style={[styles.product, on && styles.productOn]}>
                <Image source={{ uri: thumbUrl(p.imageUrl!, 240) }} style={styles.productImg} contentFit="cover" />
                <Text style={[type.meta, { color: color.ink }]} numberOfLines={2}>
                  {p.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <CardTitle style={styles.label}>{t("stories.goal")}</CardTitle>
      <View style={styles.goals} accessibilityRole="radiogroup" accessibilityLabel={t("stories.goal")}>
        {GOALS.map((g) => (
          <Pill key={g} label={t(`brief.goals.${g}`)} selected={g === goal} onPress={() => setGoal(g)} />
        ))}
      </View>

      <CardTitle style={styles.label}>{t("stories.direction")}</CardTitle>
      <Field value={direction} onChangeText={setDirection} placeholder={t("stories.directionPlaceholder")} accessibilityLabel={t("stories.direction")} maxLength={500} height={50} style={styles.input} />

      <View style={styles.cost}>
        <Text style={type.meta}>{t("stories.cost")}</Text>
        <Text style={[type.label, { fontFamily: font.semibold }]}>{t("stories.credits", { count: STORY_CREDITS })}</Text>
      </View>
      {error ? (
        <View style={{ gap: space[8], paddingTop: space[8] }}>
          <Text style={[type.meta, { color: color.error }]} accessibilityRole="alert">
            {error.text}
          </Text>
          {error.credits ? <Button label={t("stories.seePlans")} variant="outline" height={44} onPress={() => (onClose(), router.push("/plans"))} /> : null}
        </View>
      ) : null}
      <Button label={sending ? t("stories.sending") : t("stories.write")} loading={sending} disabled={!productId || sending} style={{ marginTop: space[16] }} onPress={() => void send()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[12] },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: 14, paddingBottom: space[4] },
  grid: { flexDirection: "row", gap: space[16], paddingTop: space[12], alignItems: "flex-start" },
  state: { gap: space[12], paddingTop: space[24], alignItems: "flex-start" },
  label: { paddingTop: space[16], paddingBottom: space[8] },
  products: { gap: space[8] },
  product: { width: 96, gap: 4, padding: 4, borderRadius: radius.control, borderWidth: 1, borderColor: tint.hair },
  productOn: { borderWidth: 2, borderColor: color.primary, padding: 3 },
  productImg: { width: "100%", aspectRatio: 1, borderRadius: radius.nested, backgroundColor: tint.hair },
  goals: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  input: { flex: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 19, color: color.ink, paddingVertical: 10 },
  cost: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space[16], paddingTop: space[8], borderTopWidth: 1, borderTopColor: tint.hair },
});
