import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { Check, ShieldCheck, Trash2, UserRound, VideoOff } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { PageLoading } from "@/ui/page-loading";
import { ApiError } from "@/api/client";
import { reels, type Presenter, type ReelOptions } from "@/api/endpoints";
import { color, radius, space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Footer } from "@/ui/layout";
import { isPlanRequired } from "@/ui/plans/use-plan";
import { openLowCredits } from "@/ui/recovery/open";
import { BackTitle, BrandPill, Chip, ChipRow, ICON, PageHeader, ReelsScreen, bodyMuted, eyebrow, meta, rc, strong14, Tag } from "@/ui/reels/kit";
import { useReel } from "@/ui/reels/use-reel";

const POLL_MS = 10_000;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * R10 · Reels / Choose a presenter. The brand's presenters (character sheets made from a few traits), or none.
 * Picking one saves it on the plan and has the scriptwriter choose the scenes they speak; "No presenter" clears them.
 */
export default function ReelsActor() {
  const { t } = useTranslation("reels");
  const { id, detail, busy, error, chat, save } = useReel();
  const plan = detail?.plan ?? null;
  const [options, setOptions] = useState<ReelOptions | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [traits, setTraits] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // `round` bumps to load again: after a change, and every 10 s while a presenter is being made.
  const [round, setRound] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    reels.options(ctrl.signal).then(setOptions, (e: unknown) => !ctrl.signal.aborted && setProblem(message(e)));
    return () => ctrl.abort();
  }, [round]);
  // Back on this screen (a presenter may have finished meanwhile): look again.
  useFocusEffect(useCallback(() => setRound((r) => r + 1), []));
  const making = !!options?.presenters.some((p) => p.status === "RUNNING");
  // The plan's presenter counts only while it's a finished presenter of the brand (removed or failed: none), so
  // Continue saves "none" over a dead one instead of leaving it to be refused at render.
  const live = (pid: string | undefined) => !!pid && !!options?.presenters.some((p) => p.id === pid && p.status === "DONE");
  const choice = picked ?? (plan && plan.presenter !== "none" && (!options || live(plan.presenter)) ? plan.presenter : "none");
  useEffect(() => {
    if (!making) return;
    const timer = setInterval(() => setRound((r) => r + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [making]);

  const label = (group: string, option?: string) =>
    option ? t(`actor.option.${option}`, { defaultValue: options?.traits.find((g) => g.id === group)?.options[option] ?? option }) : t(`actor.trait.${group}`, { defaultValue: group });

  const create = async () => {
    if (!options) return;
    setWorking(true);
    setProblem(null);
    try {
      await reels.createPresenter(name.trim(), traits);
      setName("");
      setTraits({});
      setRound((r) => r + 1);
    } catch (e) {
      if (isPlanRequired(e)) router.push("/plans");
      else if (e instanceof ApiError && e.status === 402) openLowCredits({ needed: options.presenterCredits, title: t("actor.create"), backdrop: t("actor.title") });
      else setProblem(message(e));
    } finally {
      setWorking(false);
    }
  };
  const remove = async (p: Presenter) => {
    if (removing) return;
    setRemoving(p.id);
    setProblem(null);
    try {
      await reels.removePresenter(p.id);
      if (picked === p.id) setPicked(null);
      setRound((r) => r + 1);
    } catch (e) {
      setProblem(message(e));
    } finally {
      setRemoving(null);
    }
  };
  // Continue: a changed choice is saved on the plan first (a presenter through the scriptwriter, which picks their scenes).
  const next = async () => {
    if (!id || !plan) return router.push("/reels/chat");
    if (choice !== plan.presenter) {
      const presenter = options?.presenters.find((p) => p.id === choice);
      const ok = presenter ? await chat(presenter.name, undefined, { presenterId: presenter.id }) : await save({ ...plan, presenter: "none" });
      if (!ok) return;
    }
    router.push("/reels/script");
  };

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("actor.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
      footer={
        <Footer>
          {error || problem ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error ?? problem}</Text> : null}
          {!id ? <Text style={[meta, { textAlign: "center" }]}>{t("actor.needsReel")}</Text> : null}
          <Button label={busy ? t("actor.applying") : t("common:continue")} arrow disabled={busy} onPress={() => void next()} />
        </Footer>
      }
    >
      <Text style={[bodyMuted, { paddingHorizontal: 4 }]}>{t("actor.intro")}</Text>

      <Option on={choice === "none"} a11y={t("actor.noPresenterA11y")} onPress={() => setPicked("none")} style={{ marginTop: space[24] }}>
        <View style={styles.noIcon}>
          <VideoOff size={24} color={color.ink} strokeWidth={ICON.strokeWidth} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={strong14}>{t("noPresenter")}</Text>
            <Tag label={t("actor.recommended")} tone="dark" style={{ backgroundColor: "#111113" }} />
          </View>
          <Text style={[meta, { paddingTop: 2 }]}>{t("actor.noPresenterBody")}</Text>
        </View>
      </Option>

      <Text style={[eyebrow, { paddingTop: space[24], paddingHorizontal: 4 }]}>{t("actor.yours")}</Text>
      {!options ? <PageLoading rows={3} /> : null}
      {options && !options.presenters.length ? <Text style={[meta, { paddingTop: space[8], paddingHorizontal: 4 }]}>{t("actor.none")}</Text> : null}
      {options?.presenters.map((p) => {
        const ready = p.status === "DONE";
        const state = p.status === "RUNNING" ? t("actor.making") : p.status === "FAILED" ? t("actor.failed") : t("actor.ready");
        return (
          <Option
            key={p.id}
            on={choice === p.id}
            a11y={`${p.name}, ${state}`}
            disabled={!ready || !id}
            onPress={() => setPicked(p.id)}
            style={{ marginTop: space[12] }}
            trailing={
              p.status === "RUNNING" ? (
                <ActivityIndicator color={color.primary} accessibilityLabel={t("actor.making")} />
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={t("actor.removeA11y", { name: p.name })} disabled={!!removing} hitSlop={8} onPress={() => void remove(p)} style={styles.remove}>
                  {removing === p.id ? <ActivityIndicator color={color.inkSecondary} /> : <Trash2 size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />}
                </Pressable>
              )
            }
          >
            <View style={styles.sheet}>
              {p.sheet ? <Image source={{ uri: p.sheet.url, cacheKey: p.sheet.key }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <UserRound size={28} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={strong14}>{p.name}</Text>
              <Text style={[meta, { paddingTop: 2 }, p.status === "FAILED" && { color: color.error }]}>{state}</Text>
            </View>
          </Option>
        );
      })}

      {options ? (
        <View style={styles.create}>
          <Text style={strong14}>{t("actor.create")}</Text>
          <Text style={[meta, { paddingTop: 2 }]}>{t("actor.createBody")}</Text>
          <View style={{ paddingTop: space[12] }}>
            <Field label={t("actor.name")} value={name} onChangeText={setName} maxLength={40} placeholder={t("actor.namePlaceholder")} />
          </View>
          {options.traits.map((g) => (
            <View key={g.id} style={{ paddingTop: space[12] }}>
              <Text style={[meta, { paddingBottom: space[8] }]}>{label(g.id)}</Text>
              <ChipRow bleed={space[16]}>
                {Object.keys(g.options).map((o) => (
                  <Chip key={o} label={label(g.id, o)} selected={traits[g.id] === o} onPress={() => setTraits((cur) => (cur[g.id] === o ? Object.fromEntries(Object.entries(cur).filter(([k]) => k !== g.id)) : { ...cur, [g.id]: o }))} />
                ))}
              </ChipRow>
            </View>
          ))}
          <View style={{ paddingTop: space[16] }}>
            <Button
              variant="outline"
              label={t("actor.createButton", { count: options.presenterCredits })}
              disabled={!name.trim() || working || making}
              loading={working}
              onPress={() => void create()}
            />
          </View>
          {making ? <Text style={[meta, { paddingTop: space[8], textAlign: "center" }]}>{t("actor.makingNote")}</Text> : null}
        </View>
      ) : null}

      <View style={styles.notice}>
        <ShieldCheck size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} style={{ marginTop: 2 }} />
        <Text style={[bodyMuted, { flex: 1 }]}>{t("actor.notice")}</Text>
      </View>
    </ReelsScreen>
  );
}

/** A radio card. `trailing` (e.g. a remove button) sits beside the radio, not inside it, so screen readers reach it. */
function Option({ on, a11y, onPress, disabled, style, trailing, children }: { on: boolean; a11y: string; onPress: () => void; disabled?: boolean; style?: object; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={[styles.option, style, on && styles.optionOn, { flexDirection: "row", alignItems: "center", gap: space[8] }]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on, disabled: !!disabled }}
        accessibilityLabel={a11y}
        disabled={disabled}
        onPress={onPress}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[12] }}
      >
        {children}
        <View style={[styles.radio, on ? { backgroundColor: color.primary } : { borderWidth: 1, borderColor: "#D4D4DC" }, disabled && { opacity: 0.4 }]}>
          {on ? <Check size={14} color={color.onPrimary} strokeWidth={2.25} /> : null}
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { padding: space[16], backgroundColor: color.surface, borderWidth: 1, borderColor: "#E4E3E9", borderRadius: radius.card },
  optionOn: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary, padding: 15 },
  noIcon: { width: 48, height: 48, borderRadius: radius.control, backgroundColor: rc.tagGrey, alignItems: "center", justifyContent: "center" },
  sheet: { width: 48, height: 48, borderRadius: 24, overflow: "hidden", backgroundColor: rc.tagGrey, alignItems: "center", justifyContent: "center" },
  remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  radio: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  create: { marginTop: space[24], padding: space[16], backgroundColor: color.surface, borderWidth: 1, borderColor: "#E4E3E9", borderRadius: radius.card },
  notice: {
    marginTop: space[24],
    flexDirection: "row",
    gap: space[12],
    padding: space[12],
    backgroundColor: rc.tagGrey,
    borderWidth: 1,
    borderColor: "#E4E4EB",
    borderRadius: radius.control,
  },
});
