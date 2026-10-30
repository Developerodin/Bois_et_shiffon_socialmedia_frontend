import { Image } from "expo-image";
import { router } from "expo-router";
import { Check, Clock, Lightbulb, Lock, Sparkles } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { firstIdeas, startFirstIdeas, type FirstIdeas } from "@/api/endpoints";
import i18n from "@/i18n";
import { Aura } from "@/ui/aura";
import { onboarding } from "@/ui/onboarding/state";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/layout";
import { imageSource, useBrandAssets } from "@/ui/onboarding/use-brand-assets";
import { color, radius, space, type } from "@/theme/tokens";

const POLL_MS = 2500;

/**
 * Starts the brand's first Scout run (free, once: the server returns the existing run on a second call) and
 * follows it. A failure says why and offers a retry; onboarding can always go on without ideas.
 * ponytail: polling while the screen is open, like Learning.
 */
function useFirstIdeas() {
  const [run, setRun] = useState<FirstIdeas["run"]>(null);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const { workspaceId: ws, brandId } = onboarding;
  useEffect(() => {
    if (!ws || !brandId) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const follow = (next: FirstIdeas["run"]) => {
      setRun(next);
      if (next?.status === "FAILED") return setFailed(next.error ?? i18n.t("onboarding:preparing.errors.stopped"));
      if (next?.status !== "SUCCEEDED") timer = setTimeout(poll, POLL_MS);
    };
    const poll = () =>
      firstIdeas(ws, brandId, ctrl.signal).then(
        (r) => follow(r.run),
        () => {
          // A network blip shouldn't end onboarding: keep polling.
          if (!ctrl.signal.aborted) timer = setTimeout(poll, POLL_MS * 2);
        },
      );
    // Research may still be writing the documents Scout plans from: the server says wait, and this asks again.
    const start = () =>
      startFirstIdeas(ws, brandId).then(
        (r) => {
          if (ctrl.signal.aborted) return;
          setWaiting(!!r.waiting);
          if (r.waiting) timer = setTimeout(start, POLL_MS);
          else follow(r.run);
        },
        (e) => !ctrl.signal.aborted && setFailed(e instanceof ApiError ? e.message : i18n.t("onboarding:preparing.errors.startFailed")),
      );
    start();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [ws, brandId, attempt]);

  return {
    run,
    waiting,
    failed: !ws || !brandId ? i18n.t("onboarding:preparing.errors.noBrand") : failed,
    retry: () => {
      setFailed(null);
      setAttempt((a) => a + 1);
    },
  };
}

/** A11 · Onboarding / Preparing content (Figma 408:809). Follows the brand's first Scout run. */
export default function Preparing() {
  const { t } = useTranslation("onboarding");
  const { run, waiting, failed, retry } = useFirstIdeas();
  const ready = run?.status === "SUCCEEDED";
  const { data: brand } = useBrandAssets();
  const photos = brand?.assets?.products.filter((p) => p.image) ?? [];
  const product = photos[0];
  const next = () => router.push("/onboarding/connect");

  return (
    <Screen
      header={
        <>
          <Aura height={480} opacity={0.35} />
          <View style={styles.top}>
            <Text style={[type.meta, { fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 }]}>{t("common:step", { step: 5, total: 5 })}</Text>
            <View style={styles.status}>
              <View style={styles.statusDot} />
              <Text style={type.meta}>{ready ? t("preparing.ready") : t("preparing.preparing")}</Text>
            </View>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: ready ? "100%" : run?.status === "RUNNING" ? "85%" : "70%" }]} />
          </View>
        </>
      }
      footer={
        <>
          {failed ? (
            <>
              <Text accessibilityRole="alert" style={[type.meta, { color: color.error, textAlign: "center" }]}>
                {failed}
              </Text>
              <Button label={t("learning.tryAgain")} onPress={retry} />
              <Button label={t("preparing.continueWithout")} variant="ghost" onPress={next} />
            </>
          ) : (
            <Button label={ready ? t("common:continue") : t("preparing.loadingButton")} arrow={ready} loading={!ready} disabled={!ready} onPress={next} />
          )}
          <View style={styles.footNote}>
            <Lock size={12} color={color.inkSecondary} strokeWidth={1.75} />
            <Text style={type.meta}>{t("preparing.catalogSafe")}</Text>
          </View>
        </>
      }
    >
      <View style={styles.hero}>
        <View style={styles.disc}>
          <Image source={require("../../../assets/figma/onboarding/espanda-mark.jpg")} style={{ width: 48, height: 48 }} contentFit="contain" />
        </View>
        <Text style={[type.pageTitle, styles.center, { paddingTop: space[24] }]}>{t("preparing.title")}</Text>
        <Text style={[type.body, styles.center, { color: color.inkSecondary, paddingTop: space[8], maxWidth: 310 }]}>
          {t("preparing.bodyIdeas", { name: brand?.name ?? "" })}
        </Text>
      </View>

      <View style={styles.list}>
        <Row
          leading={
            product?.image ? (
              <Image source={imageSource(product.image)} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={styles.iconBox}>
                <Sparkles size={18} color={color.ink} strokeWidth={1.75} />
              </View>
            )
          }
          title={t("preparing.photosReady")}
          detail={product ? t("preparing.photosCount", { product: product.title, count: photos.length }) : t("preparing.noPhotos")}
          state="done"
        />
        <Row
          leading={
            <View style={styles.iconBox}>
              <Lightbulb size={18} color={color.ink} strokeWidth={1.75} />
            </View>
          }
          title={t("preparing.ideasTitle")}
          detail={ready ? (run.ideas ? t("preparing.ideasFound", { count: run.ideas }) : t("preparing.ideasNone")) : waiting ? t("preparing.finishingResearch") : t("preparing.ideasDetail")}
          state={ready ? "done" : failed ? "queued" : "running"}
          emphasis
        />
        <Row
          leading={
            <View style={[styles.iconBox, { backgroundColor: "transparent", borderWidth: 0 }]}>
              <Sparkles size={18} color={color.inkSecondary} strokeWidth={1.75} />
            </View>
          }
          title={t("preparing.nextTitle")}
          detail={t("preparing.nextPick")}
          state={ready ? "done" : "queued"}
          muted
        />
      </View>
    </Screen>
  );
}

function Row({ leading, title, detail, state, emphasis, muted }: { leading: React.ReactNode; title: string; detail: string; state: "queued" | "running" | "done"; emphasis?: boolean; muted?: boolean }) {
  return (
    <View style={[styles.row, emphasis && state === "running" && styles.rowActive]}>
      {leading}
      <View style={{ flex: 1 }}>
        <Text style={emphasis && state === "running" ? [type.label, { fontFamily: "Inter_600SemiBold" }] : [type.meta, { color: muted ? color.inkSecondary : color.ink }]}>{title}</Text>
        <Text style={type.meta} numberOfLines={1}>{detail}</Text>
      </View>
      {state === "done" ? (
        <View style={styles.done}>
          <Check size={14} color={color.onPrimary} strokeWidth={2.5} />
        </View>
      ) : state === "running" ? (
        <ActivityIndicator size={14} color={color.ink} />
      ) : (
        <Clock size={16} color={color.inkSecondary} strokeWidth={1.75} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[20], paddingTop: space[12] },
  status: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space[4], paddingHorizontal: space[12], backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, borderRadius: radius.round },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.ink },
  track: { height: 4, marginHorizontal: space[20], marginTop: space[12], borderRadius: 999, backgroundColor: color.divider, overflow: "hidden" },
  bar: { height: 4, borderRadius: 999, backgroundColor: color.primary },
  hero: { alignItems: "center", paddingTop: space[32], paddingBottom: space[32] },
  disc: { width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: color.divider, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  center: { textAlign: "center" },
  list: { padding: space[12], gap: space[8], backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: color.divider, borderRadius: radius.card },
  row: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[8], borderRadius: radius.control },
  rowActive: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, padding: space[12] },
  thumb: { width: 36, height: 36, borderRadius: radius.control, borderWidth: 1, borderColor: color.divider },
  iconBox: { width: 36, height: 36, borderRadius: radius.nested, alignItems: "center", justifyContent: "center", backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider },
  done: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#101014", alignItems: "center", justifyContent: "center" },
  footNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
