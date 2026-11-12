import { router, useFocusEffect } from "expo-router";
import { useVideoPlayer } from "expo-video";
import { Check, ChevronDown, Pause, Play, Search, Trash2, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { type CloningInfo, type LibraryFilters, type LibraryVoice, reels, type ReelVoiceOption } from "@/api/endpoints";
import { Field } from "@/ui/field";
import { Button } from "@/ui/button";
import { color, radius, space } from "@/theme/tokens";
import { BackTitle, BrandPill, ChipRow, ICON, PageHeader, ReelsScreen, SegmentedTabs, bodyMuted, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { Sheet } from "@/ui/recovery/sheet";
import { useReel } from "@/ui/reels/use-reel";

const TABS = ["ours", "library"] as const;
const LANGUAGES = ["fr", "en", "de", "es", "it", "pt", "nl"] as const;
const GENDERS = ["female", "male", "neutral"] as const;
const AGES = ["young", "middle_aged", "old"] as const;
const USES = ["social_media", "advertisement", "narrative_story", "conversational", "informative_educational"] as const;
/** The library's filters, in the order they show; each opens a short list in a sheet. */
const FILTERS = [
  ["language", LANGUAGES],
  ["gender", GENDERS],
  ["age", AGES],
  ["useCase", USES],
] as const;
type FilterKey = (typeof FILTERS)[number][0];

/**
 * R11 → Voices: every voice a reel may use, each with a sample. Picking one saves it on the plan and goes back.
 * "Library" searches ElevenLabs' public voices by language (the reel's by default), gender, age and use case.
 */
export default function ReelsVoices() {
  const { t } = useTranslation("reels");
  const { detail, busy, error, save } = useReel();
  const plan = detail?.plan ?? null;
  const [voices, setVoices] = useState<ReelVoiceOption[] | null>(null);
  const [cloning, setCloning] = useState<CloningInfo | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("ours");
  const [filters, setFilters] = useState<LibraryFilters>({ language: "fr" });
  // Once the reel has loaded: the library in its language, and open on the library when its voice comes from there.
  const [seeded, setSeeded] = useState<string | null>(null);
  if (plan && detail && seeded !== detail.item.id) {
    setSeeded(detail.item.id);
    setFilters({ language: (plan.language ?? "fr").split("-")[0] });
    if (plan.voice.startsWith("library:")) setTab("library");
  }
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState<{ voices: LibraryVoice[]; more: boolean; usable: boolean; page: number } | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  // One player for the samples (expo-video plays audio-only files too); the source follows the voice being played.
  const sample = voices?.find((v) => v.id === playing)?.sampleUrl ?? library?.voices.find((v) => v.id === playing)?.previewUrl ?? null;
  const player = useVideoPlayer(sample);
  // The player keeps its source between samples: start each new one, and drop the pause icon when it ends or fails.
  useEffect(() => {
    if (sample) player.play();
  }, [sample, player]);
  useEffect(() => {
    const end = player.addListener("playToEnd", () => setPlaying(null));
    const status = player.addListener("statusChange", ({ status }) => status === "error" && setPlaying(null));
    return () => (end.remove(), status.remove());
  }, [player]);

  // Loaded on focus: back from cloning, the new voice is there.
  const [round, setRound] = useState(0);
  useFocusEffect(useCallback(() => setRound((r) => r + 1), []));
  useEffect(() => {
    const ctrl = new AbortController();
    reels.voices(ctrl.signal).then(
      (r) => (setVoices(r.voices), setCloning(r.cloning)),
      (e: unknown) => !ctrl.signal.aborted && setProblem(e instanceof Error ? e.message : String(e)),
    );
    return () => ctrl.abort();
  }, [round]);
  const clones = voices?.filter((v) => v.clone).length ?? 0;

  // The library: a new search on each filter change (page 0); "More voices" adds the next page.
  const [libraryRound, setLibraryRound] = useState(0);
  useEffect(() => {
    if (tab !== "library") return;
    const ctrl = new AbortController();
    reels.voiceLibrary({ ...filters, page: 0 }, ctrl.signal).then(
      (r) => setLibrary({ ...r, page: 0 }),
      (e: unknown) => !ctrl.signal.aborted && setProblem(e instanceof Error ? e.message : String(e)),
    );
    return () => ctrl.abort();
  }, [tab, filters, libraryRound]);
  // The filters a "More voices" answer belongs to: an answer for older filters is dropped.
  const asked = useRef(filters);
  useEffect(() => {
    asked.current = filters;
  }, [filters]);
  const more = async () => {
    if (!library || libraryBusy) return;
    setLibraryBusy(true);
    const forFilters = filters;
    try {
      const r = await reels.voiceLibrary({ ...filters, page: library.page + 1 });
      if (asked.current !== forFilters) return;
      // Pages aren't strictly stable at ElevenLabs: never list a voice twice.
      const seen = new Set(library.voices.map((v) => v.id));
      setLibrary({ ...r, voices: [...library.voices, ...r.voices.filter((v) => !seen.has(v.id))], page: library.page + 1 });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryBusy(false);
    }
  };
  const [open, setOpen] = useState<FilterKey | null>(null);
  const reelLanguage = (plan?.language ?? "fr").split("-")[0];
  const choose = (key: FilterKey, value: string | undefined) => (setFilters((f) => ({ ...f, [key]: value })), setOpen(null));
  const valueLabel = (key: FilterKey) => (filters[key] ? t(`voices.filter.${key}.${filters[key]}`) : t("voices.any"));
  // Anything set beyond the default (the reel's language): offer one tap back to it.
  const narrowed = !!(filters.gender || filters.age || filters.useCase || filters.search || filters.language !== reelLanguage);
  const reset = () => (setSearch(""), setFilters({ language: reelLanguage }));

  /** Delete a clone (its owner, or an admin), or withdraw consent for your own: confirmed first, it can't be undone. */
  const confirmRemove = (v: ReelVoiceOption, withdraw: boolean) =>
    Alert.alert(t(withdraw ? "voices.confirmWithdrawTitle" : "voices.confirmDeleteTitle", { name: v.name }), t("voices.confirmBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t(withdraw ? "voices.withdraw" : "voices.delete"), style: "destructive", onPress: () => void remove(v, withdraw) },
    ]);
  const remove = async (v: ReelVoiceOption, withdraw: boolean) => {
    if (removing) return;
    setRemoving(v.id);
    setProblem(null);
    try {
      await reels.deleteClone(v.id, withdraw);
      setRound((r) => r + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  };

  // A ref, not state: two taps in one frame would both pass a state check (two saves, or two backs).
  const picking = useRef(false);
  const pick = async (id: string, name?: string) => {
    if (!plan || busy || picking.current) return;
    picking.current = true;
    const ok = id === plan.voice || !!(await save({ ...plan, voice: id, voiceName: name }));
    if (ok) router.back();
    else picking.current = false;
  };

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("voices.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
    >
      <Text style={[bodyMuted, { paddingHorizontal: 4 }]}>{t("voices.intro")}</Text>
      {error || problem ? <Text style={[meta, { color: color.error, paddingTop: space[12] }]}>{error ?? problem}</Text> : null}
      <View style={{ paddingTop: space[16] }}>
        <SegmentedTabs options={TABS} value={tab} onChange={(v) => (setPlaying(null), setTab(v))} getLabel={(o) => t(`voices.tab.${o}`)} />
      </View>
      {/* The plan's voice is gone (a deleted clone): saving the plan is refused until another is picked. */}
      {voices && plan && !plan.voice.startsWith("library:") && !voices.some((v) => v.id === plan.voice) ? <Text style={[meta, { color: color.error, paddingTop: space[12] }]}>{t("voices.missing")}</Text> : null}
      {tab === "library" ? (
        <View style={{ paddingTop: space[16], gap: space[12] }}>
          {library && !library.usable ? <Text style={meta}>{t("voices.libraryNotYet")}</Text> : null}
          <Field
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setFilters((f) => ({ ...f, search: search.trim() || undefined }))}
            returnKeyType="search"
            height={48}
            leading={<Search size={18} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />}
            placeholder={t("voices.searchPlaceholder")}
            accessibilityLabel={t("voices.searchPlaceholder")}
          />
          {/* One compact row: each button shows its filter's value and opens the choices. */}
          <ChipRow bleed={space[16]}>
            {FILTERS.map(([key]) => {
              const set = !!filters[key];
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${t(`voices.filterTitle.${key}`)}: ${valueLabel(key)}`}
                  onPress={() => setOpen(key)}
                  style={[styles.filter, set && styles.filterOn]}
                >
                  <Text style={[metaInk, set && { color: color.onPrimary }]} numberOfLines={1}>
                    {t(`voices.filterTitle.${key}`)}: <Text style={{ fontWeight: "600" }}>{valueLabel(key)}</Text>
                  </Text>
                  <ChevronDown size={16} color={set ? color.onPrimary : color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                </Pressable>
              );
            })}
            {narrowed ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t("voices.clear")} onPress={reset} style={styles.filter}>
                <X size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                <Text style={metaInk}>{t("voices.clear")}</Text>
              </Pressable>
            ) : null}
          </ChipRow>
          {!library ? <ActivityIndicator style={{ paddingTop: space[16] }} color={color.primary} /> : null}
          {library && !library.voices.length ? <Text style={meta}>{t("voices.libraryNone")}</Text> : null}
          {library?.voices.map((v) => {
            const traits = [v.gender && t(`voices.filter.gender.${v.gender}`, { defaultValue: v.gender }), v.age && t(`voices.filter.age.${v.age}`, { defaultValue: v.age }), v.accent].filter(Boolean).join(" · ");
            const on = v.id === plan?.voice;
            return (
              <View key={v.id} style={[styles.row, on && styles.rowOn]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={playing === v.id ? t("voices.stopA11y", { name: v.name }) : t("voices.playA11y", { name: v.name })}
                  disabled={!v.previewUrl}
                  onPress={() => setPlaying(playing === v.id ? null : v.id)}
                  style={[styles.play, !v.previewUrl && { opacity: 0.4 }]}
                >
                  {playing === v.id ? <Pause size={20} color={color.ink} strokeWidth={ICON.strokeWidth} /> : <Play size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />}
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: busy || !plan }}
                  accessibilityLabel={`${v.name}, ${traits}`}
                  disabled={busy || !plan}
                  onPress={() => void pick(v.id, v.name)}
                  style={styles.pick}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={strong14} numberOfLines={1}>{v.name}</Text>
                    <Text style={[meta, { paddingTop: 2 }]} numberOfLines={1}>{traits}</Text>
                  </View>
                  <View style={[styles.radio, on ? { backgroundColor: color.primary } : { borderWidth: 1, borderColor: "#D4D4DC" }]}>
                    {on ? <Check size={14} color={color.onPrimary} strokeWidth={2.25} /> : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
          {library?.more ? <Button variant="outline" label={t("voices.more")} loading={libraryBusy} disabled={libraryBusy} onPress={() => void more()} /> : null}
          {problem && tab === "library" ? <Button variant="ghost" label={t("voices.retry")} onPress={() => (setProblem(null), setLibraryRound((r) => r + 1))} /> : null}
        </View>
      ) : null}
      {tab === "ours" && !voices && !problem ? <ActivityIndicator style={{ paddingTop: space[24] }} color={color.primary} /> : null}
      <View style={{ gap: space[12], paddingTop: space[16], display: tab === "ours" ? "flex" : "none" }}>
        {voices?.map((v) => {
          const on = v.id === plan?.voice;
          const gender = t(`voices.gender.${v.gender}`);
          return (
            <View key={v.id} style={[styles.row, on && styles.rowOn]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={playing === v.id ? t("voices.stopA11y", { name: v.name }) : t("voices.playA11y", { name: v.name })}
                disabled={!v.sampleUrl}
                onPress={() => setPlaying(playing === v.id ? null : v.id)}
                style={[styles.play, !v.sampleUrl && { opacity: 0.4 }]}
              >
                {playing === v.id ? <Pause size={20} color={color.ink} strokeWidth={ICON.strokeWidth} /> : <Play size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />}
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: busy || !plan }}
                accessibilityLabel={`${v.name}, ${gender}`}
                disabled={busy || !plan}
                onPress={() => void pick(v.id)}
                style={styles.pick}
              >
                <View style={{ flex: 1 }}>
                  <Text style={strong14}>{v.name}</Text>
                  <Text style={[meta, { paddingTop: 2 }]}>{v.mine ? `${gender} · ${t("voices.mine")}` : gender}</Text>
                </View>
                <View style={[styles.radio, on ? { backgroundColor: color.primary } : { borderWidth: 1, borderColor: "#D4D4DC" }]}>
                  {on ? <Check size={14} color={color.onPrimary} strokeWidth={2.25} /> : null}
                </View>
              </Pressable>
              {v.clone && (v.mine || cloning?.allowed) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("voices.deleteA11y", { name: v.name })}
                  disabled={!!removing}
                  hitSlop={8}
                  onPress={() => confirmRemove(v, false)}
                  style={styles.play}
                >
                  {removing === v.id ? <ActivityIndicator color={color.inkSecondary} /> : <Trash2 size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />}
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Withdrawing consent is the owner's own act (kept apart from Delete, and recorded as such). */}
      {tab === "ours" && voices?.some((v) => v.mine) ? (
        <View style={{ paddingTop: space[16], gap: space[4] }}>
          {voices
            .filter((v) => v.mine)
            .map((v) => (
              <Button key={v.id} variant="ghost" label={t("voices.withdrawFor", { name: v.name })} disabled={!!removing} onPress={() => confirmRemove(v, true)} />
            ))}
        </View>
      ) : null}

      {open ? (
        <Sheet onClose={() => setOpen(null)} label={t(`voices.filterTitle.${open}`)} scrim="rgba(10,10,12,0.4)">
          <Text style={[strong14, { paddingBottom: space[8] }]}>{t(`voices.filterTitle.${open}`)}</Text>
          {[undefined, ...(FILTERS.find(([k]) => k === open)?.[1] ?? [])].map((v) => {
            const on = filters[open] === v;
            return (
              <Pressable key={v ?? "any"} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => choose(open, v)} style={styles.option}>
                <Text style={[strong14, { flex: 1, fontWeight: on ? "600" : "400" }]}>{v ? t(`voices.filter.${open}.${v}`) : t("voices.any")}</Text>
                {on ? <Check size={18} color={color.primary} strokeWidth={2.25} /> : null}
              </Pressable>
            );
          })}
        </Sheet>
      ) : null}

      {tab === "ours" && cloning?.allowed ? (
        <View style={{ paddingTop: space[16], gap: space[8] }}>
          {clones >= cloning.max ? <Text style={[meta, { textAlign: "center" }]}>{t("voices.cloneFull", { max: cloning.max })}</Text> : null}
          <Button variant="outline" label={t("voices.clone", { count: cloning.credits })} disabled={clones >= cloning.max} onPress={() => router.push("/reels/clone")} />
        </View>
      ) : null}
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[8], padding: space[12], backgroundColor: color.surface, borderWidth: 1, borderColor: "#E4E3E9", borderRadius: radius.card },
  rowOn: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary, padding: 11 },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: rc.tagGrey, alignItems: "center", justifyContent: "center" },
  pick: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 44 },
  radio: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  filter: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: space[12], borderRadius: radius.round, borderWidth: 1, borderColor: "#D4D4DC", backgroundColor: color.surface },
  filterOn: { backgroundColor: color.primary, borderColor: color.primary },
  option: { flexDirection: "row", alignItems: "center", minHeight: 52, borderBottomWidth: 1, borderBottomColor: color.divider },
});
