import { useCallback, useMemo, useState } from "react";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { ArrowRight, Circle, CircleCheck, Info, Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Trans, useTranslation } from "react-i18next";
import { aiDraft, google, type GooglePost, type GoogleProfile } from "@/api/endpoints";
import { formatDate } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Footer } from "@/ui/layout";
import { Divider, FloatingHeader, TextButton, mc, title16 } from "@/ui/marketing/kit";
import { ActionButton, ICON, Panel, ReelsScreen, SegmentedTabs, Tag, bodyMuted, eyebrow, meta, metaInk, rc } from "@/ui/reels/kit";
import { useCurrentBrand } from "@/ui/use-current-brand";

const TABS = ["profile", "posts", "reviews"] as const;
type Connected = Extract<GoogleProfile, { connected: true }>;
type Draft = { summary: string; photo: { key: string; url: string; title: string } | null };

/**
 * M14 · Google Growth / Workspace, on the connected Business Profile. Posts: what's live, and "New Google post" drafts
 * one from a brand photo (AI) that the person edits and publishes with their own tap. Profile: the setup checklist from
 * Google's own data. Reviews hands over to the Customers reviews tab.
 */
export default function GoogleWorkspace() {
  const { t } = useTranslation("marketing");
  const brand = useCurrentBrand();
  const [tab, setTab] = useState<(typeof TABS)[number]>("posts");
  const [profile, setProfile] = useState<Connected | null>(null);
  const [posts, setPosts] = useState<GooglePost[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tabLabels = TABS.map((id) => t(`googleWorkspace.tabs.${id}`));

  const load = useCallback(() => {
    google.get().then(
      (r) => {
        if (!r.profile.connected) return router.replace("/marketing/google");
        setError(null);
        setProfile(r.profile);
        setPosts(r.posts);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  useFocusEffect(load);

  // Photos a post can show: Research's product photos, then the owner's uploads.
  const photos = useMemo(() => {
    const v = brand?.view;
    return [...(v?.assets?.products ?? []), ...(v?.uploads ?? [])].flatMap((p) => (p.image ? [{ ...p.image, title: p.title }] : [])).slice(0, 20);
  }, [brand?.view]);

  const run = async (kind: "draft" | "publish", call: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await call();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const newPost = () =>
    run("draft", async () => {
      const photo = photos[0] ?? null;
      setTab("posts");
      setDraft({ summary: await aiDraft({ kind: "googlePost", topic: photo?.title }), photo });
    });
  const publish = () =>
    run("publish", async () => {
      if (!draft) return;
      await google.post(draft.summary.trim(), draft.photo?.key);
      setDraft(null);
      setNotice(t("googleWorkspace.posted"));
      load();
    });

  return (
    <ReelsScreen
      footer={
        draft ? undefined : (
          <Footer>
            <ActionButton label={t("googleWorkspace.newPost")} leading={Plus} disabled={!profile?.verified || busy !== null} onPress={() => void newPost()} style={{ marginHorizontal: -4 }} />
          </Footer>
        )
      }
      contentStyle={{ paddingTop: 0 }}
    >
      <FloatingHeader label={profile?.name ?? brand?.name ?? ""} fallback="/marketing" />
      <Text style={[type.pageTitle, { paddingTop: space[16] }]}>{t("shared.googleGrowth")}</Text>
      <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("googleWorkspace.subtitle")}</Text>

      <View style={{ marginTop: space[20] }}>
        <SegmentedTabs options={tabLabels} value={tabLabels[TABS.indexOf(tab)]} onChange={(label) => setTab(TABS[tabLabels.indexOf(label)] ?? tab)} />
      </View>

      {error ? (
        <View style={{ paddingTop: space[16] }}>
          <Text style={[meta, { color: color.error }]}>{error}</Text>
          <TextButton label={t("google.retry")} onPress={load} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : null}
      {notice ? <Text style={[metaInk, { paddingTop: space[16] }]}>{notice}</Text> : null}
      {profile && !profile.verified && tab !== "reviews" ? (
        <Panel style={[styles.notice, { marginTop: space[20] }]}>
          <Info size={20} color={color.ink} strokeWidth={ICON.strokeWidth} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[title16, { fontSize: 15 }]}>{t("googleWorkspace.unverifiedTitle")}</Text>
            <Text style={[bodyMuted, { paddingTop: 2 }]}>{t("googleWorkspace.unverifiedBody")}</Text>
          </View>
        </Panel>
      ) : null}
      {!profile && !error ? <ActivityIndicator color={color.primary} style={{ marginTop: space[24] }} /> : null}
      {busy === "draft" ? <ActivityIndicator color={color.primary} style={{ marginTop: space[24] }} /> : null}

      {profile && tab === "posts" && draft ? (
        <Panel style={{ marginTop: space[20] }}>
          <View style={styles.rowBetween}>
            <Text style={eyebrow}>{t("googleWorkspace.draftPostTitle")}</Text>
            <Tag label={t("shared.draft")} style={styles.draftTag} textStyle={{ fontSize: 13 }} />
          </View>
          {photos.length ? (
            <View style={styles.photoRow}>
              {photos.slice(0, 8).map((p) => {
                const on = draft.photo?.key === p.key;
                return (
                  <Pressable
                    key={p.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={p.title}
                    onPress={() => setDraft({ ...draft, photo: on ? null : p })}
                    style={[styles.thumb, on && styles.thumbOn]}
                  >
                    <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <TextInput
            value={draft.summary}
            onChangeText={(summary) => setDraft({ ...draft, summary })}
            multiline
            maxLength={1500}
            accessibilityLabel={t("googleWorkspace.postText")}
            style={styles.input}
          />
          {profile.website ? (
            <Text style={[metaInk, { paddingTop: space[8] }]}>
              <Trans t={t} ns="marketing" i18nKey="googleWorkspace.actionButton" values={{ action: t("googleWorkspace.postActions.learnMore") }} components={{ value: <Text style={styles.actionValue} /> }} />
            </Text>
          ) : null}
          <Divider style={{ marginTop: space[12] }} />
          <View style={[styles.rowBetween, { paddingTop: space[8] }]}>
            <TextButton label={t("googleWorkspace.discard")} onPress={() => setDraft(null)} />
            <ActionButton label={t("googleWorkspace.publishPost")} disabled={busy !== null || !draft.summary.trim()} onPress={() => void publish()} />
          </View>
          <Text style={[meta, { paddingTop: space[8] }]}>{t("google.controlBody")}</Text>
        </Panel>
      ) : null}

      {profile && tab === "posts" && !draft ? (
        posts.length ? (
          <View style={{ gap: space[12], marginTop: space[20] }}>
            {posts.map((p) => (
              <Panel key={p.id}>
                <View style={{ flexDirection: "row", gap: space[12] }}>
                  {p.photoUrl ? <Image source={{ uri: p.photoUrl }} style={styles.postImage} contentFit="cover" /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={bodyMuted} numberOfLines={3}>
                      {p.summary}
                    </Text>
                    <Text style={[meta, { paddingTop: space[8] }]}>
                      {formatDate(p.createdAt, { day: "numeric", month: "short", year: "numeric" })} · {t(`googleWorkspace.postState.${p.state === "LIVE" ? "live" : p.state === "REJECTED" ? "rejected" : "processing"}`)}
                    </Text>
                  </View>
                </View>
              </Panel>
            ))}
          </View>
        ) : (
          <Panel style={{ marginTop: space[20] }}>
            <Text style={title16}>{t("googleWorkspace.noPostsTitle")}</Text>
            <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("googleWorkspace.noPostsBody")}</Text>
          </Panel>
        )
      ) : null}

      {profile && tab === "reviews" ? (
        <Panel style={{ marginTop: space[20] }}>
          <Text style={title16}>{t("googleWorkspace.reviewsTitle")}</Text>
          <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("googleWorkspace.reviewsBody")}</Text>
          <TextButton label={t("googleWorkspace.openReviews")} trailing={ArrowRight} onPress={() => router.push("/marketing/reviews")} style={{ alignSelf: "flex-start" }} />
        </Panel>
      ) : null}

      {profile && tab === "profile" ? <Checklist profile={profile} /> : null}
    </ReelsScreen>
  );
}

/** Profile tab: what Google has, from the location itself. The review link is shareable once Google gives one. */
function Checklist({ profile }: { profile: Connected }) {
  const { t } = useTranslation("marketing");
  const rows: { id: string; done: boolean; value: string; onPress?: () => void }[] = [
    { id: "profile", done: true, value: profile.name },
    { id: "verified", done: profile.verified, value: t(profile.verified ? "googleWorkspace.checklist.verified.yes" : "googleWorkspace.checklist.verified.no") },
    {
      id: "reviewLink",
      done: !!profile.reviewUrl,
      value: t(profile.reviewUrl ? "googleWorkspace.checklist.reviewLink.share" : "googleWorkspace.checklist.reviewLink.waiting"),
      onPress: profile.reviewUrl ? () => void Share.share({ message: profile.reviewUrl! }) : undefined,
    },
    { id: "hours", done: profile.hasHours, value: t(profile.hasHours ? "googleWorkspace.checklist.hours.yes" : "googleWorkspace.checklist.hours.no") },
    { id: "website", done: !!profile.website, value: profile.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") ?? t("googleWorkspace.checklist.website.no") },
  ];
  return (
    <Panel style={{ marginTop: space[16] }}>
      <Text style={title16}>{t("googleWorkspace.checklistTitle")}</Text>
      {profile.address ? <Text style={[meta, { paddingTop: 4 }]}>{profile.address}</Text> : null}
      <View style={{ paddingTop: space[8] }}>
        {rows.map((item) => {
          const Icon = item.done ? CircleCheck : Circle;
          return (
            <View key={item.id} style={[styles.rowBetween, { minHeight: 44 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], flexShrink: 1 }}>
                <Icon size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
                <Text style={[meta, { fontSize: 13 }]}>{t(`googleWorkspace.checklist.${item.id}.label`)}</Text>
              </View>
              {item.onPress ? <TextButton label={item.value} onPress={item.onPress} /> : <Text style={[metaInk, { fontSize: 13, flexShrink: 1, textAlign: "right" }]} numberOfLines={1}>{item.value}</Text>}
            </View>
          );
        })}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  notice: { flexDirection: "row", gap: space[12] },
  draftTag: { backgroundColor: mc.iconCircle, paddingVertical: 2, paddingHorizontal: space[8] },
  postImage: { width: 64, height: 64, borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
  actionValue: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[12] },
  thumb: { width: 56, height: 56, borderRadius: radius.control, overflow: "hidden", borderWidth: 1, borderColor: rc.fieldBorder },
  thumbOn: { borderWidth: 3, borderColor: color.primary },
  input: { ...type.body, fontSize: 14, minHeight: 120, textAlignVertical: "top", marginTop: space[12], padding: space[12], borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
});
