import type { ReactNode } from "react";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, BadgeCheck, Crop, MousePointer2, Type, Undo2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { stories, type StoryBody, type StoryFrameInput, type StoryInput, type StoryRelease } from "@/api/endpoints";
import { Toggle } from "@/ui/business/kit";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { PageLoading } from "@/ui/page-loading";
import { Sheet } from "@/ui/recovery/sheet";
import { color, radius, space, type } from "@/theme/tokens";
import { BusinessChip, glass, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { reloadPosts, usePosts } from "@/ui/posts/use-posts";
import { useWorkingPoll } from "@/ui/posts/use-working-poll";
import { CropArea, CropControls, CropImage, type Crop as FrameCrop, type Size } from "@/ui/stories/crop";
import { storyCodeText, storyError } from "@/ui/stories/errors";
import { FrameMenu, frameLabel, FrameStrip } from "@/ui/stories/frame-strip";
import { STORY_LIMITS, textFits } from "@/ui/stories/limits";
import { type Picked, StoryPicker } from "@/ui/stories/picker";
import { StoryPreview } from "@/ui/stories/preview";
import { ClipPicture, Trim } from "@/ui/stories/trim";
import { usePermissions } from "@/ui/use-permissions";

/**
 * A frame being edited; `from` is its index in the saved version (its rendered picture), -1 for a new one. `picked`
 * is a newly chosen photo or clip, previewed until a save renders it.
 */
type EditFrame = StoryFrameInput & { from: number; picked?: Pick<Picked, "url" | "kind" | "size"> };
type Draft = { frames: EditFrame[]; cta: string; link: string; brandMark: boolean };
/**
 * `key` names the field last typed in, so a run of keystrokes in one field is one change for Undo. `base` is the
 * version the edits started from: the save is checked against it, so someone else's newer save is never overwritten
 * (the shared posts list, and with it `version`, moves on whenever any screen reloads it).
 */
type Edits = { draft: Draft; history: Draft[]; key: string | null; base: number };
type Tool = "text" | "image" | "brand" | "cta";

const EDITABLE = ["PLANNED", "BRIEF_READY", "DRAFT_REVIEW", "AWAITING_APPROVAL", "APPROVED", "REJECTED", "BLOCKED"];
const HTTPS = /^https:\/\/\S+$/i;

const fromBody = (b: StoryBody): Draft => ({
  frames: b.frames.map(({ source, label, headline, body, composition, crop, clip }, from) => ({ source, label, headline, body, composition, crop, clip, from })),
  cta: b.cta,
  link: b.link,
  brandMark: b.brandMark,
});
// Only client fields go up (the server strips its own anyway); JSON drops the undefined ones.
const toInput = (d: Draft): StoryInput => ({ frames: d.frames.map(({ from: _from, picked: _picked, ...f }) => f), cta: d.cta, link: d.link, brandMark: d.brandMark });
const same = (a: Draft, b: Draft) => JSON.stringify(toInput(a)) === JSON.stringify(toInput(b));

/**
 * P08 · Posts / Edit story: a true 9:16 preview of the selected frame, the frame strip, and the Text, Image, Brand
 * and CTA tools. Image and the strip's + open the picker (a phone upload, a product photo, the library); Image also
 * crops the frame (drag and pinch on the preview, or Fit / Fill), and for a clip picks its 15 s and its sound. Saving
 * makes a new version and renders it; Save and check opens the story, and an approved story left unchanged offers Schedule
 * story instead. Undo steps back one change; leaving with changes asks first. While frames are being prepared the
 * editor is read-only.
 */
export default function EditStory() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id: string }>();
  const { all, loading, error } = usePosts();
  const story = all?.find((p) => p.id === id && p.channel === "INSTAGRAM_STORY") ?? null;
  const { can } = usePermissions();
  const insets = useSafeAreaInsets();
  const [release, setRelease] = useState<StoryRelease | null>(null);
  const [edits, setEdits] = useState<Edits | null>(null);
  const [selected, setSelected] = useState(0);
  const [tool, setTool] = useState<Tool | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The version a save was based on (and whether it renders first, for clips): until the new version shows up, the
  // edits stay on screen, read-only.
  const [savedFrom, setSavedFrom] = useState<{ version: number; rendering: boolean } | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  // The frame whose "…" menu is open, and the blocked navigation the discard sheet is asking about.
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  // The picker is open for frame i, or for a new frame ("new").
  const [picking, setPicking] = useState<number | "new" | null>(null);
  // The selected frame's source as loaded on the preview: its picture size (crop) and a clip's length (trim).
  const [media, setMedia] = useState<{ url: string; size?: Size; duration?: number } | null>(null);
  const noteMedia = useCallback(
    (url: string, m: { size?: Size; duration?: number }) =>
      setMedia((p) => ({ ...(p?.url === url ? p : {}), url, ...(m.size ? { size: m.size } : {}), ...(m.duration !== undefined ? { duration: m.duration } : {}) })),
    [],
  );

  const version = story?.latest?.version ?? null;
  const body = story?.latest?.body as unknown as StoryBody | undefined;
  const saved = body ? fromBody(body) : null;
  // The saved version has landed: it is the new starting point. A failed render leaves the edits to fix and save again.
  const landed = !!savedFrom && version !== savedFrom.version;
  const renderFailed = !!savedFrom?.rendering && !!release && !release.rendering && !!release.renderError;
  const active = landed ? null : edits;
  const pending = !!savedFrom && !landed && !renderFailed;
  const draft = active?.draft ?? saved;
  const changed = !!active && !!saved && !pending && !same(active.draft, saved);

  const load = useCallback(() => (id ? stories.get(id).then(setRelease, () => undefined) : Promise.resolve()), [id]);
  useEffect(() => void load(), [load]);
  const refresh = useCallback(async () => {
    await Promise.all([reloadPosts(), load()]);
  }, [load]);
  const { slow } = useWorkingPoll(!!release?.rendering || pending, version ?? 0, refresh);

  const disablePrevention = usePreventRemove(changed, ({ repeat }) => setLeaving(() => repeat));

  if (!story || !draft || !saved || version === null) {
    const failed = error ? t("stories.detail.loadFailed") : story ? t("stories.editor.noDraft") : !loading && all ? t("stories.errors.notFound") : null;
    return (
      <PostsScreen header={<PageHeader title={t("stories.editStory")} />} contentStyle={{ padding: space[16] }}>
        {failed ? <Text style={type.body}>{failed}</Text> : <PageLoading photo />}
      </PostsScreen>
    );
  }

  const editable = EDITABLE.includes(story.status) && can("content.create");
  const rendering = !!release?.rendering || pending;
  const readOnly = !editable || rendering || busy;
  const frames = draft.frames;
  const at = Math.min(selected, Math.max(frames.length - 1, 0));
  const frame = frames[at] as EditFrame | undefined;
  const last = frames.length - 1;
  const savedLast = saved.frames.length - 1;
  const renderedOf = (f: EditFrame) => (f.from >= 0 && !f.picked ? (release?.frames[f.from]?.url ?? null) : null);
  const urlOf = (f: EditFrame) => f.picked?.url ?? renderedOf(f);
  const kindOf = (f: EditFrame) => f.picked?.kind ?? (f.from >= 0 ? (body?.frames[f.from]?.mediaKind ?? null) : null);
  // The rendered picture still shows this frame as edited (its text, crop and clip window, its CTA if it's last, the
  // brand mark).
  const fresh = (f: EditFrame, i: number) => {
    const s = saved.frames[f.from];
    if (!s || draft.brandMark !== saved.brandMark || s.label !== f.label || s.headline !== f.headline || s.body !== f.body) return false;
    if (s.crop?.x !== f.crop?.x || s.crop?.y !== f.crop?.y || s.crop?.scale !== f.crop?.scale) return false;
    if (s.clip?.start !== f.clip?.start || s.clip?.sound !== f.clip?.sound) return false;
    return (i === last) === (f.from === savedLast) && (i !== last || draft.cta === saved.cta);
  };
  const misfit = frames.map((f, i) => textFits(f, i === last, draft.cta)).findIndex((r) => !r.fits);
  const fit = frame ? textFits(frame, at === last, draft.cta) : ({ fits: true } as const);
  const badLink = !!draft.link && !HTTPS.test(draft.link);
  const problem = misfit >= 0 ? t("stories.editor.frameTooLong", { n: misfit + 1 }) : badLink ? t("stories.editor.badLink") : null;
  const approved = story.status === "APPROVED" && !!release?.approvalValid && !changed && can("publish.execute");

  const change = (next: Draft, key: string | null = null) => {
    const history = active && key !== null && active.key === key ? active.history : [...(active?.history ?? []), draft];
    setEdits({ draft: next, history, key, base: active?.base ?? version });
    setSavedFrom(null);
  };
  const undo = () => {
    const h = active?.history ?? [];
    // h[0] is the version the edits started from, so undoing the first change drops the edits altogether.
    setEdits(active && h.length > 1 ? { ...active, draft: h[h.length - 1], history: h.slice(0, -1), key: null } : null);
  };
  const setFrame = (patch: Partial<StoryFrameInput>, field: string) =>
    change({ ...draft, frames: frames.map((f, i) => (i === at ? { ...f, ...patch } : f)) }, `${field}:${at}`);
  const move = (i: number, dir: -1 | 1) => {
    const next = [...frames];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    change({ ...draft, frames: next });
    setSelected(i + dir);
  };
  // A new photo or clip drops the old one's crop; a clip starts at 0 with sound.
  const pick = (p: Picked) => {
    const media = { source: p.source, picked: { url: p.url, kind: p.kind, size: p.size }, crop: undefined, clip: p.kind === "video" ? { start: 0, sound: true } : undefined };
    if (picking === "new") {
      change({ ...draft, frames: [...frames, { label: "", headline: "", body: "", from: -1, ...media }] });
      setSelected(frames.length);
    } else if (picking !== null) {
      change({ ...draft, frames: frames.map((f, i) => (i === picking ? { ...f, ...media } : f)) });
    }
    setPicking(null);
  };
  const remove = (i: number) => {
    change({ ...draft, frames: frames.filter((_, j) => j !== i) });
    if (at >= i && at > 0) setSelected(at - 1);
  };

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      const r = await stories.editStory(story.id, active?.base ?? version, toInput(draft));
      setRelease(r);
      setSavedFrom({ version: active?.base ?? version, rendering: r.saved === "rendering" });
      // The history stays: if a clip's render fails, Undo still steps back one change at a time.
      if (active) setEdits({ ...active, key: null });
      void reloadPosts();
      return true;
    } catch (e) {
      setSaveError(storyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openStory = () => {
    disablePrevention();
    router.dismissTo({ pathname: "/posts/story/[id]", params: { id: story.id } });
  };
  const main = async () => {
    if (approved) return router.push({ pathname: "/posts/schedule", params: { id: story.id } });
    if (changed && !(await save())) return;
    openStory();
  };
  // Nothing behind the editor (a deep link): openStory skips the discard check, so ask here first.
  const back = () => (router.canGoBack() ? router.back() : changed ? setLeaving(() => openStory) : openStory());

  // Fit 9:16 into the space between the header and the tools below: letterboxed on short phones.
  const pw = Math.min(area.width, (area.height * 9) / 16);
  const tools: { key: Tool; Icon: typeof Type; off?: boolean }[] = [
    { key: "text", Icon: Type, off: !frame },
    { key: "image", Icon: Crop, off: !frame },
    { key: "brand", Icon: BadgeCheck },
    { key: "cta", Icon: MousePointer2 },
  ];
  const strip = frames.map((f) => ({ url: urlOf(f), kind: kindOf(f), headline: f.headline }));
  // Image mode: the source shows (a clip plays its window) and drag / pinch crop it. A reel keeps its framing.
  const imageMode = tool === "image" && !readOnly && !!frame;
  const src = frame ? (frame.picked?.url ?? (frame.from >= 0 ? (release?.frames[frame.from]?.sourceUrl ?? null) : null)) : null;
  const isClip = !!frame && kindOf(frame) === "video";
  const clip = frame?.clip ?? { start: 0, sound: true };
  const cropLocked = frame?.source?.kind === "reel";
  // A clip's upright size from the server comes first: the player's track size can be before rotation (a portrait phone
  // clip reports landscape), and the crop must be worked out on the shape the renderer cuts.
  const serverSize = !isClip || !frame ? undefined : frame.picked ? frame.picked.size : (release?.frames[frame.from]?.sourceSize ?? undefined);
  const srcSize = serverSize ?? (media && media.url === src ? media.size : undefined);
  const duration = media && media.url === src ? (media.duration ?? null) : null;
  const setCrop = (c: FrameCrop | undefined) => setFrame({ crop: c }, "crop");
  const sourceView = (crop?: FrameCrop) =>
    !src ? null : isClip ? (
      <ClipPicture url={src} clip={clip} crop={cropLocked ? undefined : crop} width={pw} size={srcSize} playing={imageMode} onLoad={(m) => noteMedia(src, m)} />
    ) : (
      <CropImage uri={src} crop={cropLocked ? undefined : crop} width={pw} size={srcSize} onSize={(size) => noteMedia(src, { size })} />
    );
  const preview = (f: EditFrame, crop?: FrameCrop) => (
    <StoryPreview
      frame={f}
      isLast={at === last}
      cta={draft.cta}
      brandMark={draft.brandMark}
      editing={tool === "text"}
      url={renderedOf(f)}
      sourceUrl={src}
      sourceView={sourceView(crop)}
      fresh={!imageMode && fresh(f, at)}
      width={pw}
      accessibilityLabel={frameLabel(t, strip[at], at, frames.length)}
    />
  );
  // Someone else saved since these edits started: saving now is refused (story.stale).
  const stale = !!active && version !== active.base && !savedFrom;
  const failure = renderFailed ? storyCodeText(release?.renderErrorCode, release?.renderError ?? "") : (saveError ?? (stale ? t("stories.errors.stale") : null));
  const status = rendering
    ? slow
      ? t("detail.slow")
      : t("stories.detail.preparing")
    : (failure ?? problem ?? (!editable ? t("stories.editor.readOnly") : null));

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <GlassButton label={t("editStory.back")} onPress={back}>
          <ArrowLeft size={20} color={color.onPrimary} strokeWidth={1.75} />
        </GlassButton>
        <BusinessChip dark />
        <GlassButton label={t("editStory.undo")} onPress={undo} disabled={!active?.history.length || readOnly}>
          <Undo2 size={20} color={color.onPrimary} strokeWidth={1.75} />
        </GlassButton>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.stage} onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          {pw > 0 && frame && imageMode && src && !cropLocked ? (
            <CropArea src={srcSize} crop={frame.crop} width={pw} onChange={setCrop}>
              {(crop) => preview(frame, crop)}
            </CropArea>
          ) : pw > 0 && frame ? (
            preview(frame, frame.crop)
          ) : pw > 0 ? (
            <View style={[styles.empty, { width: pw, height: (pw * 16) / 9 }]}>
              <Text style={[type.meta, { color: color.onPrimary, textAlign: "center" }]}>{t("stories.detail.noFrames")}</Text>
            </View>
          ) : null}
          <View style={styles.tools}>
            {tools.map(({ key, Icon, off }) => {
              const name = t(`editStory.tools.${key}`);
              const disabled = off || readOnly;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={t("editStory.toolLabel", { tool: name })}
                  accessibilityState={{ selected: tool === key, disabled }}
                  disabled={disabled}
                  onPress={() => setTool(tool === key ? null : key)}
                  style={[styles.tool, tool === key && styles.toolOn, disabled && { opacity: 0.5 }]}
                >
                  <Icon size={20} color={tool === key ? color.onPrimary : color.ink} strokeWidth={1.75} />
                  <Text style={[type.label, tool === key && { color: color.onPrimary }]}>{name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {tool && !readOnly ? (
          // The inset sits outside the scroll area, so its last row (a clip's Sound) is never under the navigation bar.
          <View style={[styles.panelWrap, { paddingBottom: insets.bottom }]}>
            <ScrollView style={styles.panel} contentContainerStyle={{ gap: space[8], padding: space[16] }} keyboardShouldPersistTaps="handled">
              <View style={styles.panelHead}>
                <Text style={type.cardTitle}>{t(`editStory.tools.${tool}`)}</Text>
                <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setTool(null)}>
                  <Text style={[type.label, { color: color.primary }]}>{t("stories.editor.done")}</Text>
                </Pressable>
              </View>
              {tool === "text" && frame ? (
                <>
                  {/* Above the fields, so the keyboard never hides it. */}
                  {!fit.fits ? (
                    <Text accessibilityLiveRegion="polite" style={[type.meta, { color: color.error }]}>
                      {t("stories.editor.tooLong", { field: t(`stories.editor.${fit.field}`) })}
                    </Text>
                  ) : null}
                  <Field label={t("stories.editor.label")} value={frame.label} maxLength={STORY_LIMITS.label} height={44} onChangeText={(v) => setFrame({ label: v }, "label")} />
                  <Field label={t("stories.editor.headline")} value={frame.headline} maxLength={STORY_LIMITS.headline} height={44} onChangeText={(v) => setFrame({ headline: v }, "headline")} />
                  <Field label={t("stories.editor.body")} value={frame.body} maxLength={STORY_LIMITS.body} height={44} onChangeText={(v) => setFrame({ body: v }, "body")} />
                </>
              ) : tool === "image" && frame ? (
                <>
                  <Button label={frame.source ? t("stories.picker.replace") : t("stories.picker.add")} onPress={() => setPicking(at)} />
                  {src ? <CropControls size={srcSize} crop={frame.crop} locked={cropLocked} onChange={setCrop} /> : null}
                  {isClip && src ? (
                    <>
                      <Trim duration={duration} start={clip.start} onChange={(start) => setFrame({ clip: { ...clip, start } }, "trim")} />
                      <View style={styles.between}>
                        <Text style={[type.body, { flex: 1 }]}>{t("stories.trim.sound")}</Text>
                        <Toggle label={t("stories.trim.sound")} value={clip.sound} onValueChange={(v) => setFrame({ clip: { ...clip, sound: v } }, "sound")} />
                      </View>
                    </>
                  ) : null}
                </>
              ) : tool === "brand" ? (
                <View style={styles.between}>
                  <Text style={[type.body, { flex: 1 }]}>{t("stories.editor.brandMark")}</Text>
                  <Toggle label={t("stories.editor.brandMark")} value={draft.brandMark} onValueChange={(v) => change({ ...draft, brandMark: v })} />
                </View>
              ) : tool === "cta" ? (
                <>
                  <Field label={t("stories.editor.cta")} value={draft.cta} maxLength={STORY_LIMITS.cta} height={44} onChangeText={(v) => change({ ...draft, cta: v }, "cta")} />
                  <Field
                    label={t("stories.editor.link")}
                    value={draft.link}
                    maxLength={STORY_LIMITS.link}
                    height={44}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="https://"
                    error={badLink ? t("stories.editor.badLink") : null}
                    onChangeText={(v) => change({ ...draft, link: v.trim() }, "link")}
                  />
                  {last >= 0 && !textFits(frames[last], true, draft.cta).fits ? <Text style={[type.meta, { color: color.error }]}>{t("stories.editor.tooLong", { field: t("stories.editor.cta") })}</Text> : null}
                  <Text style={type.meta}>{t("stories.scheduling.noLinkScheduled")}</Text>
                </>
              ) : null}
            </ScrollView>
          </View>
        ) : (
          <View style={{ paddingBottom: Math.max(insets.bottom, space[16]) }}>
            <FrameStrip frames={strip} selected={at} onSelect={setSelected} onMenu={setMenuFor} onAdd={() => setPicking("new")} disabled={readOnly} />
            <View style={styles.bottom}>
              <View style={styles.caption}>
                <Text style={[type.meta, { color: color.onPrimary }]} numberOfLines={2}>
                  {draft.link ? t("stories.detail.link", { link: draft.link }) : t("stories.detail.noLink")}
                </Text>
              </View>
              {status ? (
                <Text accessibilityLiveRegion="polite" style={[type.meta, { color: failure || problem ? "#FCA5A5" : color.onPrimary, textAlign: "center" }]}>
                  {status}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button label={t("editStory.saveDraft")} variant="outline" style={{ flex: 1 }} disabled={!changed || readOnly || !!problem} onPress={() => void save()} />
                <Button
                  label={busy ? t("edit.saving") : approved ? t("editStory.scheduleStory") : t("stories.editor.saveAndCheck")}
                  arrow
                  style={{ flex: 2 }}
                  disabled={busy || (changed && (readOnly || !!problem))}
                  onPress={() => void main()}
                />
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <StoryPicker visible={picking !== null} productIds={body?.productIds ?? []} onClose={() => setPicking(null)} onPick={pick} />
      <FrameMenu index={menuFor} frames={strip} onClose={() => setMenuFor(null)} onMove={move} onRemove={remove} />
      <Sheet visible={!!leaving} onClose={() => setLeaving(null)} label={t("stories.editor.discardTitle")} scrim="rgba(10,10,12,0.6)" gutter={space[20]}>
        <Text style={[type.cardTitle, { fontFamily: "Inter_600SemiBold" }]}>{t("stories.editor.discardTitle")}</Text>
        <Text style={[type.body, { paddingTop: space[8], paddingBottom: space[20] }]}>{t("stories.editor.discardBody")}</Text>
        <View style={{ gap: space[8] }}>
          <Button label={t("stories.editor.keepEditing")} onPress={() => setLeaving(null)} />
          <Button
            label={t("stories.editor.discard")}
            variant="danger"
            onPress={() => {
              const go = leaving;
              setLeaving(null);
              go?.();
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

function GlassButton({ label, onPress, disabled, children }: { label: string; onPress?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.glassBtn, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.8 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  header: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[16] },
  glassBtn: { ...glass, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  stage: { flex: 1, minHeight: 160, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", padding: space[16], backgroundColor: "#1F1B26" },
  tools: { position: "absolute", right: 14, top: space[8], gap: space[12] },
  tool: {
    width: 56,
    height: 56,
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  toolOn: { backgroundColor: color.primary, borderColor: color.primary },
  panelWrap: { backgroundColor: color.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  panel: { flexGrow: 0, maxHeight: 340 },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  between: { flexDirection: "row", alignItems: "center", gap: space[12] },
  bottom: { paddingTop: space[8], paddingHorizontal: space[16], gap: space[8] },
  caption: { padding: space[12], backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: radius.control },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8] },
});
