import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { brandAssets, currentBrand, posts, uploadPhoto, type PostBody } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BusinessChip, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge, CardTitle, SegmentedTabs, tint } from "@/ui/posts/controls";
import { coverUrl, reloadPosts, usePost } from "@/ui/posts/use-posts";
import { useCurrentBrand } from "@/ui/use-current-brand";
import { usePermissions } from "@/ui/use-permissions";

const TABS = ["image", "caption", "brand"] as const;
type Tab = (typeof TABS)[number];
type Photo = { key: string; url: string; title: string };

const sparkles = require("../../../assets/figma/posts/btn-sparkles.svg");
// The writer reads this (in English, like the rest of its instructions); the person only sees the button.
const REWRITE_NOTE = "Write a new caption: a different hook and angle, the same facts and call to action.";

const back = () => (router.canGoBack() ? router.back() : router.navigate("/posts"));

/** P04 · Posts / Edit post: crop preview, then Image (brand photo or upload) · Caption · Brand. */
export default function EditPost() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { post } = usePost(id);
  const brand = useCurrentBrand();
  const { can } = usePermissions();
  const body = post?.latest?.body;
  const [tab, setTab] = useState<Tab>("caption");
  // null = unchanged from the draft, so a reload of the list doesn't overwrite what the person is typing.
  const [caption, setCaption] = useState<string | null>(null);
  const [tags, setTags] = useState<string[] | null>(null);
  const [newTag, setNewTag] = useState<string | null>(null);
  // The chosen pictures in order (first = cover); null = the draft's own.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [library, setLibrary] = useState<Photo[]>([]);
  const [language, setLanguage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "rewrite" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentBrand()
      .then((b) => brandAssets(b.workspaceId, b.brandId))
      .then((a) => {
        setLibrary((a.assets?.products ?? []).flatMap((p) => (p.image ? [{ key: p.image.key, url: p.image.url, title: p.title }] : [])));
        setLanguage(a.preferences.contentLanguage);
      }, () => {});
  }, []);

  if (!post || !post.latest || !body) {
    return (
      <PostsScreen header={<PageHeader title={t("edit.title")} right={<BusinessChip />} />} contentStyle={{ padding: space[16] }}>
        {post ? <Text style={type.body}>{t("detail.noDraft")}</Text> : <ActivityIndicator color={color.primary} />}
      </PostsScreen>
    );
  }
  const version = post.latest.version;
  const text = caption ?? body.caption;
  const hashtags = tags ?? body.hashtags;
  const keys = picked ?? body.photoKeys ?? [];
  const carousel = post.channel === "INSTAGRAM_CAROUSEL";
  const max = carousel ? 10 : 1;
  // The draft's own pictures first (an earlier upload isn't among the product photos), then the brand's.
  const draftPhotos = (body.photoKeys ?? []).map((key, i) => ({ key, url: post.latest!.photoUrls[i] ?? "", title: post.title }));
  const photos = [...draftPhotos, ...library].filter((p, i, all) => p.url && all.findIndex((q) => q.key === p.key) === i);
  const shown = picked ? photos.find((p) => p.key === keys[0])?.url : coverUrl(post);
  const changed = caption !== null || tags !== null || picked !== null;
  const tooFew = carousel && keys.length < 2;
  const togglePhoto = (key: string) =>
    setPicked(keys.includes(key) ? keys.filter((k) => k !== key) : max === 1 ? [key] : keys.length < max ? [...keys, key] : keys);
  // A post being scheduled or already out can't be edited (the server says so too).
  const editable = !["SCHEDULED", "PUBLISHED", "REVIEWED"].includes(post.status);

  const run = async (what: "save" | "rewrite", call: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await call();
      await reloadPosts();
      back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const save = () => {
    const next: PostBody = { ...body, caption: text, hashtags, ...(picked ? { photoKeys: picked } : {}) };
    return run("save", () => posts.edit(post.id, version, next));
  };
  const rewrite = () => run("rewrite", () => posts.sendBack(post.id, version, REWRITE_NOTE));
  const addTag = () => {
    const tag = newTag?.trim().replace(/^#*/, "").replace(/\s+/g, "");
    if (tag && !hashtags.includes(`#${tag}`)) setTags([...hashtags, `#${tag}`]);
    setNewTag(null);
  };
  const upload = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (r.canceled) return;
    const a = r.assets[0];
    setBusy("upload");
    setError(null);
    try {
      const up = await uploadPhoto(a.uri);
      const mine = { key: up.key, url: up.previewUrl, title: a.fileName ?? t("edit.yourPhoto") };
      setLibrary((l) => [mine, ...l]);
      togglePhoto(mine.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PostsScreen
      header={<PageHeader title={t("edit.title")} right={<BusinessChip />} />}
      contentStyle={{ paddingTop: space[12], paddingBottom: space[24] }}
      footer={
        <View style={{ gap: space[8] }}>
          {error ? <Text style={[type.meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          {tooFew ? <Text style={[type.meta, { textAlign: "center" }]}>{t("edit.carouselMin")}</Text> : null}
          <View style={styles.footerRow}>
            <Button label={t("edit.cancel")} variant="outline" height={48} style={{ flex: 1 }} onPress={back} />
            <Button label={busy === "save" ? t("edit.saving") : t("edit.save")} style={{ flex: 2 }} disabled={!changed || !editable || !text.trim() || tooFew || busy !== null} onPress={() => void save()} />
          </View>
        </View>
      }
    >
      {/* 4:5 crop preview with a rule-of-thirds grid. */}
      <View style={styles.preview} accessibilityLabel={t("edit.previewLabel", { title: post.title })}>
        {shown ? <Image source={{ uri: shown }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={styles.grid} pointerEvents="none">
          {[0, 1, 2].map((r) => (
            <View key={r} style={[styles.gridRow, r < 2 && styles.gridLineB]}>
              {[0, 1, 2].map((c) => (
                <View key={c} style={[{ flex: 1 }, c < 2 && styles.gridLineR]} />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.ratio}>
          <Text style={[type.meta, { color: color.onPrimary }]}>{t("edit.ratio")}</Text>
        </View>
      </View>

      <SegmentedTabs label={t("edit.sectionLabel")} options={TABS.map((value) => ({ value, label: t(`edit.tabs.${value}`) }))} value={tab} onChange={setTab} fill />

      {tab === "caption" ? (
        <>
          <View style={styles.box}>
            <View style={styles.between}>
              <CardTitle>{t("edit.description")}</CardTitle>
              {language ? <Text style={type.meta}>{t("edit.language", { lang: language.toUpperCase() })}</Text> : null}
            </View>
            <View style={{ paddingTop: space[8] }}>
              <Field multiline value={text} onChangeText={setCaption} editable={editable} accessibilityLabel={t("edit.description")} style={styles.textarea} />
            </View>
            <View style={styles.tags}>
              <Text style={type.meta}>{t("edit.suggestedHashtags")}</Text>
              <View style={styles.tagWrap}>
                {hashtags.map((tag) => (
                  <Pressable key={tag} accessibilityRole="button" accessibilityLabel={t("edit.removeHashtag", { tag })} disabled={!editable} onPress={() => setTags(hashtags.filter((x) => x !== tag))}>
                    <Badge>{`${tag}  ×`}</Badge>
                  </Pressable>
                ))}
                {newTag === null ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t("edit.addHashtag")} disabled={!editable} onPress={() => setNewTag("")} style={styles.add}>
                    <Text style={type.label}>{t("edit.add")}</Text>
                  </Pressable>
                ) : (
                  <Field value={newTag} onChangeText={setNewTag} onSubmitEditing={addTag} onBlur={addTag} autoFocus autoCapitalize="none" placeholder="#" accessibilityLabel={t("edit.addHashtag")} height={44} style={styles.tagInput} />
                )}
              </View>
            </View>
          </View>
          {/* Only a draft waiting for approval can be sent back; the writer rewrites it in a minute or so. */}
          {post.status === "AWAITING_APPROVAL" && can("content.approve") ? (
            <Button
              label={busy === "rewrite" ? t("edit.regenerating") : t("edit.regenerate")}
              variant="outline"
              icon={sparkles}
              disabled={busy !== null || changed}
              style={{ marginTop: space[16], marginBottom: space[20] }}
              onPress={() => void rewrite()}
            />
          ) : null}
        </>
      ) : tab === "image" ? (
        <View style={styles.box}>
          <CardTitle>{t("edit.tabs.image")}</CardTitle>
          <Text style={[type.meta, { paddingTop: space[4] }]}>{carousel ? t("edit.carouselHint") : t("edit.imageHint")}</Text>
          <View style={styles.photos}>
            {photos.map((p) => {
              const at = keys.indexOf(p.key);
              return (
                <Pressable
                  key={p.key}
                  accessibilityRole={carousel ? "checkbox" : "radio"}
                  accessibilityState={{ checked: at >= 0 }}
                  accessibilityLabel={p.title}
                  disabled={!editable}
                  onPress={() => togglePhoto(p.key)}
                  style={[styles.photo, at >= 0 && styles.photoOn]}
                >
                  <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {carousel && at >= 0 ? (
                    <View style={styles.order}>
                      <Text style={[type.meta, { color: color.onPrimary }]}>{at + 1}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Button label={busy === "upload" ? t("edit.uploading") : t("edit.upload")} variant="outline" disabled={!editable || busy !== null} style={{ marginTop: space[12] }} onPress={() => void upload()} />
        </View>
      ) : (
        <View style={styles.box}>
          <CardTitle>{t("edit.tabs.brand")}</CardTitle>
          <Text style={[type.meta, { paddingTop: space[4] }]}>{t("edit.brandHint", { brand: brand?.name ?? "" })}</Text>
        </View>
      )}
    </PostsScreen>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: "row", gap: space[8] },
  preview: { alignSelf: "center", width: 224, height: 280, borderRadius: radius.control, overflow: "hidden", backgroundColor: "#171717", borderWidth: 1, borderColor: "#E5E5E5" },
  grid: { position: "absolute", top: 16, left: 16, right: 16, bottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", borderRadius: radius.badge },
  gridRow: { flex: 1, flexDirection: "row" },
  gridLineB: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.2)" },
  gridLineR: { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.2)" },
  ratio: { position: "absolute", left: 10, bottom: 10, paddingVertical: 2, paddingHorizontal: space[8], borderRadius: 6, backgroundColor: "rgba(0,0,0,0.7)" },
  box: {
    marginTop: space[12],
    padding: space[16],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: tint.hair,
    borderRadius: radius.control,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: space[8] },
  textarea: { flex: 1, height: 96, fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.ink, textAlignVertical: "top", paddingVertical: 0 },
  tags: { marginTop: space[12], paddingTop: space[12], borderTopWidth: 1, borderTopColor: tint.hair },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[4], paddingTop: space[8] },
  add: { minHeight: 44, paddingHorizontal: space[8], alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: "#D4D4D4", borderRadius: radius.control },
  tagInput: { minWidth: 120, fontFamily: font.regular, fontSize: 16, color: color.ink },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[12] },
  photo: { width: 72, height: 90, borderRadius: radius.control, overflow: "hidden", backgroundColor: tint.hair, borderWidth: 1, borderColor: tint.hair },
  photoOn: { borderWidth: 2, borderColor: color.primary },
  order: { position: "absolute", top: 4, left: 4, minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: color.primary },
});
