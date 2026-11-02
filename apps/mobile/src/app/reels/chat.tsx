import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, ArrowUp, Clapperboard, ImagePlus, RotateCcw, Sparkle, Zap } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { brandAssets, currentBrand, opportunities } from "@/api/endpoints";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { ActionButton, BackButton, Chip, ICON, PageHeader, ReelsScreen, bodyMuted, eyebrow, meta, metaInk, rc } from "@/ui/reels/kit";
import { photos } from "@/ui/reels/sample";
import { useReel } from "@/ui/reels/use-reel";
import { libraryPhotos } from "@/ui/use-current-brand";

const DURATIONS = [20, 30] as const;
/** Labels: reels:noPresenter / reels:aiActor. */
const PRESENTERS = ["noPresenter", "aiActor"] as const;
// Same rule as the server (apps/web/server/reels/plan.ts): ~2 words a second, each scene 3–15 s.
const sceneSeconds = (voice: string) => Math.min(15, Math.max(3, Math.ceil(voice.trim().split(/\s+/).filter(Boolean).length / 2)));

type Starter = { label: string; message: string; opportunityId?: string };

/**
 * R04 · Reels / Plan in chat. The scriptwriter writes and revises the plan here; redo notes come here too.
 * Chat conventions (ChatGPT, Claude, WhatsApp): the sent message shows at once with a typing bubble, the thread
 * follows the newest message, an empty chat offers starters, and a failed send can be retried in place.
 */
export default function ReelsChat() {
  const { t } = useTranslation("reels");
  const { id, detail, error, busy, pending, live, chat } = useReel();
  const [draft, setDraft] = useState("");
  const [lastSent, setLastSent] = useState<{ message: string; opportunityId?: string } | null>(null);
  const [starters, setStarters] = useState<Starter[]>([]);
  const plan = detail?.plan ?? null;
  const seconds = plan ? plan.scenes.reduce((n, s) => n + sceneSeconds(s.voiceText), 0) : null;
  const photoUrl = plan ? detail?.photoUrls[plan.scenes[0].photoKey] : undefined;
  const turns = detail?.chat ?? [];
  const fresh = !id;
  const lastAssistant = turns.map((x) => x.role).lastIndexOf("assistant");
  // How much of the thread was there when the screen opened (a new chat: none). A plan card that arrives later fades in.
  const [seen, setSeen] = useState<number | null>(() => (id ? null : 0));
  if (detail && seen === null) setSeen(turns.length);
  const isNew = (i: number) => seen !== null && i >= seen;

  // A new chat offers Scout's reel ideas, topped up with the brand's own products.
  useEffect(() => {
    if (!fresh) return;
    Promise.all([
      opportunities().then((r) => r.opportunities.filter((o) => o.channels.includes("INSTAGRAM_REEL") && o.decision !== "REJECT"), () => []),
      currentBrand().then((b) => brandAssets(b.workspaceId, b.brandId)).then((a) => libraryPhotos(a), () => []),
    ]).then(([ideas, products]) => {
      const fromIdeas: Starter[] = ideas.slice(0, 3).map((o) => ({ label: o.title, message: o.title, opportunityId: o.id }));
      const fromProducts: Starter[] = products.map((p) => ({ label: t("chat.starterProduct", { product: p.title }), message: t("chat.starterProduct", { product: p.title }) }));
      setStarters([...fromIdeas, ...fromProducts].slice(0, 3));
    });
  }, [fresh, t]);

  const send = (message: string, opportunityId?: string) => {
    if (!message.trim() || busy) return;
    setDraft("");
    setLastSent({ message: message.trim(), opportunityId });
    void chat(message.trim(), opportunityId);
  };

  return (
    <ReelsScreen
      stickToBottom
      header={
        <PageHeader
          left={<BackButton />}
          center={
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
              <Image source={photos.mark} style={{ width: 24, height: 24 }} contentFit="contain" />
              <Text style={[type.label, { fontFamily: font.semibold }]}>{t("assistant")}</Text>
            </View>
          }
          right={
            detail ? (
              <View style={styles.credits} accessibilityLabel={t("chat.creditsA11y", { count: detail.credits })}>
                <Zap size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
                <Text style={metaInk}>{formatNumber(detail.credits)}</Text>
              </View>
            ) : null
          }
        />
      }
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[8], paddingBottom: space[16] }}
      footer={
        <View style={styles.composerBar}>
          <View style={styles.composer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("chat.addAssets")}
              onPress={() => router.push("/reels/assets")}
              disabled={!detail}
              style={[styles.icon44, !detail && { opacity: 0.4 }]}
            >
              <ImagePlus size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              editable={!busy}
              placeholder={plan ? t("chat.placeholderRevise") : t("chat.placeholderNew")}
              placeholderTextColor={color.inkMuted}
              accessibilityLabel={plan ? t("chat.placeholderRevise") : t("chat.placeholderNew")}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("chat.send")}
              onPress={() => send(draft)}
              disabled={busy || !draft.trim()}
              style={[styles.icon44, { backgroundColor: color.primary, opacity: busy || !draft.trim() ? 0.5 : 1 }]}
            >
              {busy ? <ActivityIndicator color={color.onPrimary} /> : <ArrowUp size={20} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />}
            </Pressable>
          </View>
        </View>
      }
    >
      <View style={{ alignItems: "center", paddingTop: 4 }}>
        <View style={styles.dayPill}>
          <Text style={meta}>{t("chat.day")}</Text>
        </View>
      </View>

      {fresh && !pending ? (
        <View style={styles.assistantRow}>
          <Avatar />
          <View style={{ flex: 1, gap: space[12] }}>
            <Text style={type.body}>{t("chat.greeting")}</Text>
            {starters.map((s) => (
              <Pressable key={s.label} accessibilityRole="button" onPress={() => send(s.message, s.opportunityId)} style={({ pressed }) => [styles.starter, pressed && { backgroundColor: color.selection }]}>
                <Text style={[type.label, { flex: 1 }]}>{s.label}</Text>
                <ArrowRight size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {turns.map((turn, i) =>
        turn.role === "user" ? (
          <UserBubble key={i} text={turn.text} />
        ) : (
          <View key={i} style={styles.assistantRow}>
            <Avatar />
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{turn.text}</Text>
              {i === lastAssistant && plan ? (
                <FadeIn style={styles.planCard} animate={isNew(i)}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Image source={photoUrl ? { uri: photoUrl } : undefined} style={styles.planImg} contentFit="cover" accessibilityLabel={plan.scenes[0].shot} />
                    <View style={{ flex: 1 }}>
                      <Text style={strongTitle}>{plan.title}</Text>
                      <Text style={[meta, { paddingTop: 2 }]}>{t("chat.planMeta", { count: plan.scenes.length, seconds })}</Text>
                    </View>
                  </View>

                  <Text style={[meta, { paddingTop: space[16] }]}>{t("chat.duration")}</Text>
                  <View style={styles.options}>
                    <Chip label={t("chat.currentLength", { seconds })} selected />
                    {DURATIONS.filter((d) => seconds === null || Math.abs(seconds - d) > 5).map((d) => (
                      <Chip key={d} label={t("secondsShort", { seconds: d })} onPress={() => send(t("chat.makeItSeconds", { seconds: d }))} />
                    ))}
                  </View>
                  <Text style={[meta, { paddingTop: space[12] }]}>{t("chat.presenter")}</Text>
                  <View style={styles.options}>
                    {PRESENTERS.map((p) => (
                      <Chip key={p} label={t(p)} selected={p === "noPresenter"} onPress={() => (p === "aiActor" ? router.push("/reels/actor") : undefined)} />
                    ))}
                  </View>

                  <View style={styles.hook}>
                    <Text style={eyebrow}>{t("chat.openingHook")}</Text>
                    <Text style={[type.body, { paddingTop: 4 }]}>{plan.scenes[0].voiceText}</Text>
                  </View>

                  <ActionButton
                    style={{ marginTop: space[16] }}
                    leading={Clapperboard}
                    trailing={ArrowRight}
                    label={t("chat.reviewStoryboard", { count: plan.scenes.length })}
                    onPress={() => router.push("/reels/storyboard")}
                  />
                </FadeIn>
              ) : null}
            </View>
          </View>
        ),
      )}

      {pending ? <UserBubble text={pending} /> : null}
      {/* What the scriptwriter has written so far, streamed: the reply, then the plan growing scene by scene, under
          the step it's on (reading the brand → writing → the director picking a video model per scene). */}
      {busy ? (
        <View style={styles.assistantRow} accessibilityLiveRegion="polite">
          <Avatar />
          <View style={{ flex: 1, gap: space[12] }}>
            {live?.reply ? <Text style={type.body}>{live.reply}</Text> : null}
            {live && (live.title || live.scenes.length > 0) ? (
              <View style={[styles.planCard, { marginTop: 0, gap: space[12] }]}>
                {live.title ? <Text style={strongTitle}>{live.title}</Text> : null}
                {live.scenes.map((s, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <Text style={eyebrow}>{t("chat.draftScene", { n: i + 1, shot: s.shot })}</Text>
                    {s.voiceText ? <Text style={bodyMuted}>{s.voiceText}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}
            <TypingDots
              label={
                live?.stage === "directing"
                  ? t("chat.directing")
                  : live?.stage === "writing"
                    ? live.scenes.length ? t("chat.stageScenes", { count: live.scenes.length }) : t("chat.writingPlan")
                    : t("chat.stageReading")
              }
            />
          </View>
        </View>
      ) : null}

      {error && !busy ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Text style={[meta, { color: color.error, flex: 1 }]}>{error}</Text>
          {lastSent ? (
            <Pressable accessibilityRole="button" onPress={() => send(lastSent.message, lastSent.opportunityId)} style={styles.retry}>
              <RotateCcw size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
              <Text style={type.label}>{t("chat.tryAgain")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ReelsScreen>
  );
}

/** True when the person asked the system to reduce motion: then nothing below animates. */
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Three dots rising in turn while the scriptwriter works (the ChatGPT/iMessage typing cue). */
function TypingDots({ label }: { label: string }) {
  const reduce = useReduceMotion();
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  useEffect(() => {
    if (reduce) return;
    const step = (v: Animated.Value) => Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const loop = Animated.loop(Animated.stagger(140, dots.map(step)));
    loop.start();
    return () => loop.stop();
  }, [dots, reduce]);
  return (
    <View style={styles.typing}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]}
        />
      ))}
      <Text style={[metaInk, { marginLeft: 6 }]}>{label}</Text>
    </View>
  );
}

/** Fades and lifts its content in once (the plan card after its reply); static when motion is reduced. */
function FadeIn({ children, style, animate }: { children: React.ReactNode; style: object; animate: boolean }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (!animate || reduce) return v.setValue(1);
    Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [animate, reduce, v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>;
}

function Avatar() {
  return (
    <View style={styles.avatar}>
      <Sparkle size={18} color={color.primary} strokeWidth={ICON.strokeWidth} />
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignItems: "flex-end", paddingTop: space[24] }}>
      <View style={styles.userBubble}>
        <Text style={type.body}>{text}</Text>
      </View>
    </View>
  );
}

const strongTitle = { ...type.label, fontFamily: font.semibold };

const styles = StyleSheet.create({
  credits: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: space[12],
    borderRadius: radius.control,
    backgroundColor: color.surface,
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  dayPill: { paddingVertical: 2, paddingHorizontal: space[12], borderRadius: radius.badge, backgroundColor: "rgba(255,255,255,0.6)" },
  // Soft brand tint, a tighter corner toward the sender (as in iMessage/WhatsApp).
  userBubble: { maxWidth: "82%", paddingVertical: space[12], paddingHorizontal: space[16], borderRadius: radius.card, borderBottomRightRadius: 6, backgroundColor: color.selection },
  // The assistant speaks as plain text beside its avatar (ChatGPT/Claude); only the plan is a card.
  assistantRow: { flexDirection: "row", gap: space[12], paddingTop: space[24] },
  avatar: { width: 28, height: 28, marginTop: 2, borderRadius: 14, backgroundColor: color.selection, alignItems: "center", justifyContent: "center" },
  starter: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    minHeight: 48,
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
  },
  planCard: {
    marginTop: space[16],
    padding: space[16],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.card,
    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  },
  planImg: { width: 56, height: 56, marginRight: space[12], borderRadius: radius.control, backgroundColor: rc.tagGrey },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[8] },
  hook: { marginTop: space[16], padding: space[12], backgroundColor: rc.softPanel, borderRadius: radius.control },
  typing: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, minHeight: 40, paddingHorizontal: space[16], borderRadius: radius.card, backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.primary },
  errorRow: { flexDirection: "row", alignItems: "center", gap: space[12], marginTop: space[16], marginLeft: 40 },
  retry: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: space[12], borderRadius: radius.control, borderWidth: 1, borderColor: color.divider, backgroundColor: color.surface },
  composerBar: { paddingTop: space[12], paddingHorizontal: space[16], paddingBottom: space[20], backgroundColor: rc.bar },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[8],
    paddingHorizontal: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  input: { flex: 1, maxHeight: 96, paddingVertical: 10, paddingHorizontal: space[12], fontFamily: font.regular, fontSize: 16, lineHeight: 19, color: color.ink },
  icon44: { width: 44, height: 44, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
});
