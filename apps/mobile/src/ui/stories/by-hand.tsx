import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { stories } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Card } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";
import { storyError } from "@/ui/stories/errors";
import { albumName, saveFramesToGallery } from "@/ui/stories/package";

/**
 * An approved story set to be posted by hand: Save frames (the package: approval and product gate checked by the
 * server first), the numbered steps, Copy link, then "I posted it" with the story's link if the person has it.
 */
export function ByHand({ id, title, frames, link, onPosted }: { id: string; title: string; frames: number; link: string; onPosted: () => void }) {
  const { t } = useTranslation("posts");
  const [pending, setPending] = useState<"save" | "posted" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  const run = async (key: "save" | "posted", fn: () => Promise<void>) => {
    setPending(key);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(storyError(e));
    } finally {
      setPending(null);
    }
  };
  const save = () =>
    run("save", async () => {
      const how = await saveFramesToGallery(await stories.package(id), title);
      setNote(how === "saved" ? t("stories.byHandView.saved", { album: albumName(title) }) : t("stories.byHandView.shared"));
    });
  const posted = () =>
    run("posted", async () => {
      await stories.postedByHand(id, url.trim() || undefined);
      onPosted();
    });
  const copy = async () => {
    await Clipboard.setStringAsync(link);
    setCopied(true);
  };
  const steps = [t("stories.byHandView.step1"), t("stories.byHandView.step2"), t("stories.byHandView.step3", { count: frames }), ...(link ? [t("stories.byHandView.step4")] : []), t("stories.byHandView.step5")];

  return (
    <Card style={{ marginTop: space[12], gap: space[12] }}>
      <Text style={styles.eyebrow}>{t("stories.byHandView.title")}</Text>
      <Button label={pending === "save" ? t("stories.byHandView.saving") : t("stories.byHandView.saveFrames")} height={44} loading={pending === "save"} disabled={pending !== null} onPress={() => void save()} />
      {note ? (
        <Text style={type.meta} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      <View style={{ gap: space[8] }}>
        {steps.map((s, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.num}>
              <Text style={[type.meta, { color: color.ink, fontFamily: "Inter_600SemiBold" }]}>{i + 1}</Text>
            </View>
            <Text style={[type.body, { flex: 1 }]}>{s}</Text>
          </View>
        ))}
      </View>
      {link ? (
        <View style={{ gap: space[8] }}>
          <Text style={type.meta} numberOfLines={2} selectable>
            {link}
          </Text>
          <Button label={copied ? t("stories.byHandView.copied") : t("stories.byHandView.copyLink")} variant="outline" height={44} onPress={() => void copy()} />
        </View>
      ) : null}
      <Field
        label={t("stories.byHandView.linkField")}
        placeholder={t("stories.byHandView.linkPlaceholder")}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        maxLength={300}
      />
      {error ? <Text style={[type.meta, { color: color.error }]}>{error}</Text> : null}
      <Button label={t("stories.byHandView.postedIt")} loading={pending === "posted"} disabled={pending !== null} onPress={() => void posted()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space[8] },
  num: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: radius.badge, backgroundColor: "#F0EFF4" },
});
