import { File } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Play } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { type MediaSize, stories, type SourceRef, type StorySource } from "@/api/endpoints";
import { color, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { PageLoading } from "@/ui/page-loading";
import { Sheet } from "@/ui/recovery/sheet";
import { Segmented } from "@/ui/segmented";
import { storyError } from "@/ui/stories/errors";
import { UploadCancelled, uploadToSlot, type UploadProgress } from "@/ui/stories/upload";

/** What a frame gets from the picker: the source to save, and a picture to preview until the save renders it. */
/** `size`: a clip's upright size from the server (the player's track size can be before rotation). */
export type Picked = { source: SourceRef; kind: "photo" | "video"; url: string; durationSec?: number; size?: MediaSize };
type Tab = "phone" | "products" | "library" | "generate";

// The types the server takes (server/stories/uploads.ts); the picker's mimeType, else the file's extension.
const BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", mov: "video/quicktime" };
const KIND_OF: Record<string, "photo" | "video"> = { "image/jpeg": "photo", "image/png": "photo", "video/mp4": "video", "video/quicktime": "video" };
// The server's limits (server/stories/uploads.ts, probe.ts), checked here first so a file it would refuse isn't sent.
const MAX_BYTES = { photo: 15 * 1024 * 1024, video: 100 * 1024 * 1024 } as const;
const MAX_CLIP_MS = 180_000;

/**
 * The Image tool's picker (P08), as a bottom sheet with four tabs. Phone: the person first says "We own or may use
 * this" (each time), then picks or shoots a photo or clip, which is uploaded here with progress and Cancel. Products
 * and Library list what the server already has. Generate comes with Photoshoot and Reels (shown off until then).
 * Closing the sheet cancels a running upload.
 */
export function StoryPicker({ visible, productIds, onClose, onPick }: { visible: boolean; productIds: string[]; onClose: () => void; onPick: (p: Picked) => void }) {
  const { t } = useTranslation("posts");
  const [tab, setTab] = useState<Tab>("phone");
  const [rights, setRights] = useState<"yes" | "no" | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<"products" | "library", StorySource[]> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const upload = useRef<{ cancel(): void } | null>(null);
  // An upload finishes later: hand its result to the editor as it is then, not as it was when the upload began.
  const onPickNow = useRef(onPick);
  useEffect(() => {
    onPickNow.current = onPick;
  });
  const products = productIds.join(",");
  // Three tiles a row inside the sheet's 20 px gutters.
  const tile = (useWindowDimensions().width - space[20] * 2 - space[8] * 2) / 3;

  // Fresh on every open: new uploads show up, and the preview links (signed for an hour) are new.
  useEffect(() => {
    if (!visible) return;
    const ctrl = new AbortController();
    stories.sources(products ? products.split(",") : [], ctrl.signal).then(
      (r) => setSources({ products: r.tabs.find((x) => x.tab === "products")?.items ?? [], library: r.tabs.find((x) => x.tab === "library")?.items ?? [] }),
      (e) => !ctrl.signal.aborted && setLoadError(storyError(e)),
    );
    return () => {
      ctrl.abort();
      // Closed (by the person or by a pick): stop any upload and ask about rights again next time.
      upload.current?.cancel();
      upload.current = null;
      setRights(null);
      setProgress(null);
      setError(null);
      setSources(null);
      setLoadError(null);
    };
  }, [visible, products]);

  const choose = async (camera: boolean) => {
    setError(null);
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return setError(t("stories.picker.cameraDenied"));
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images", "videos"] };
    const r = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const kind = a.type === "video" ? "video" : "photo";
    const contentType = a.mimeType ?? BY_EXT[a.uri.split(".").pop()?.toLowerCase() ?? ""];
    if (!contentType || KIND_OF[contentType] !== kind) return setError(t("stories.errors.type"));
    const bytes = new File(a.uri).size;
    if (bytes > MAX_BYTES[kind]) return setError(t("stories.errors.tooLarge"));
    if (kind === "video" && (a.duration ?? 0) > MAX_CLIP_MS) return setError(t("stories.errors.videoLong"));
    setProgress({ fraction: 0, offline: false });
    // Only the running upload may move the bar: a cancelled or replaced one is ignored.
    const job = uploadToSlot(a.uri, kind, bytes, contentType, (p) => upload.current === job && setProgress(p));
    upload.current = job;
    try {
      const { uploadId, durationSec, size } = await job.promise;
      onPickNow.current({ source: { kind: "upload", id: uploadId }, kind, url: a.uri, ...(durationSec === undefined ? {} : { durationSec }), ...(size ? { size } : {}) });
    } catch (e) {
      if (!(e instanceof UploadCancelled)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (upload.current === job) upload.current = null;
      setProgress(null);
      setRights(null); // the answer covered that one file
    }
  };
  const cancel = () => {
    upload.current?.cancel();
    upload.current = null;
  };

  const tabs: { value: Tab; label: string; disabled?: boolean }[] = [
    { value: "phone", label: t("stories.picker.phone") },
    { value: "products", label: t("stories.picker.products"), disabled: !!progress },
    { value: "library", label: t("stories.picker.library"), disabled: !!progress },
    // TODO(Task 19): Generate (Photoshoot, Reels).
    { value: "generate", label: t("stories.picker.generate"), disabled: true },
  ];
  const items = tab === "products" || tab === "library" ? sources?.[tab] : undefined;

  return (
    <Sheet visible={visible} onClose={onClose} label={t("stories.picker.title")} scrim="rgba(10,10,12,0.6)" gutter={space[20]}>
      <Text style={[type.cardTitle, { fontFamily: "Inter_600SemiBold", paddingBottom: space[12] }]}>{t("stories.picker.title")}</Text>
      <Segmented options={tabs} value={tab} onChange={(v) => !progress && setTab(v)} label={t("stories.picker.tabs")} />
      <View style={{ paddingTop: space[16], gap: space[12] }}>
        {tab === "phone" ? (
          progress ? (
            <>
              {/* Only the state is announced (uploading, checking, offline); the percentage is the progress bar's value. */}
              <View style={styles.between}>
                <Text accessibilityLiveRegion="polite" style={[type.body, progress.offline && { color: color.error }]}>
                  {progress.offline ? t("stories.picker.offline") : progress.fraction >= 1 ? t("stories.picker.checking") : t("stories.picker.uploading")}
                </Text>
                {!progress.offline && progress.fraction < 1 ? (
                  <Text importantForAccessibility="no" style={type.body}>
                    {t("stories.picker.percent", { percent: Math.round(progress.fraction * 100) })}
                  </Text>
                ) : null}
              </View>
              <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100) }}>
                <View style={[styles.bar, { width: `${Math.round(progress.fraction * 100)}%` }]} />
              </View>
              <Button label={t("stories.picker.cancel")} variant="outline" onPress={cancel} />
            </>
          ) : rights === "yes" ? (
            <>
              <Button label={t("stories.picker.choose")} onPress={() => void choose(false)} />
              <Button label={t("stories.picker.camera")} variant="outline" onPress={() => void choose(true)} />
            </>
          ) : (
            <>
              <Text style={type.body}>{t("stories.picker.rightsQuestion")}</Text>
              <Button label={t("stories.picker.rightsYes")} onPress={() => setRights("yes")} />
              <Button label={t("stories.picker.rightsNo")} variant="outline" onPress={() => setRights("no")} />
              {rights === "no" ? <Text accessibilityLiveRegion="polite" style={type.meta}>{t("stories.picker.rightsRefused")}</Text> : null}
            </>
          )
        ) : loadError ? (
          <Text style={[type.body, { color: color.error }]}>{loadError}</Text>
        ) : !items ? (
          <PageLoading rows={1} />
        ) : !items.length ? (
          <Text style={type.body}>{tab === "products" ? t("stories.picker.noProducts") : t("stories.picker.emptyLibrary")}</Text>
        ) : (
          <View style={styles.grid}>
            {items.map((s) => (
              <Pressable
                key={`${s.ref.kind}:${s.ref.id}`}
                accessibilityRole="button"
                accessibilityLabel={t("stories.picker.pick", { title: s.kind === "video" ? `${s.title}, ${t("stories.picker.video")}` : s.title })}
                onPress={() =>
                  onPick({
                    source: s.ref,
                    kind: s.kind,
                    url: s.previewUrl,
                    ...(s.durationSec === undefined ? {} : { durationSec: s.durationSec }),
                    ...(s.width && s.height ? { size: { width: s.width, height: s.height } } : {}),
                  })
                }
                style={({ pressed }) => [styles.tile, { width: tile, height: (tile * 16) / 9 }, pressed && { opacity: 0.8 }]}
              >
                <Image source={{ uri: s.previewUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {s.kind === "video" ? (
                  <View style={styles.play}>
                    <Play size={12} color={color.onPrimary} fill={color.onPrimary} strokeWidth={2} />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
        {tab === "phone" && error ? (
          <Text accessibilityLiveRegion="polite" style={[type.meta, { color: color.error }]}>
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: "row", justifyContent: "space-between", gap: space[12] },
  track: { height: 8, borderRadius: radius.round, backgroundColor: color.divider, overflow: "hidden" },
  bar: { height: 8, backgroundColor: color.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  tile: { borderRadius: radius.badge, overflow: "hidden", backgroundColor: color.divider },
  play: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" },
});
