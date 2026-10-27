import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, ArrowUp, Clapperboard, Plus, Smartphone, Sparkle, Zap } from "lucide-react-native";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { ActionButton, BackButton, Chip, ICON, PageHeader, ReelsScreen, eyebrow, meta, metaInk, rc } from "@/ui/reels/kit";
import { brand, ideas, photos } from "@/ui/reels/sample";

const DURATIONS = [20, 30] as const;
/** Labels: reels:noPresenter / reels:aiActor. */
const PRESENTERS = ["noPresenter", "aiActor"] as const;

/** R04 · Reels / Plan in chat. */
export default function ReelsChat() {
  const { t } = useTranslation("reels");
  const [duration, setDuration] = useState<number>(20);
  const [presenter, setPresenter] = useState<string>("noPresenter");
  const [draft, setDraft] = useState("");

  return (
    <ReelsScreen
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
            <View style={styles.credits} accessibilityLabel={t("chat.creditsA11y", { count: brand.credits })}>
              <Zap size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
              <Text style={metaInk}>{formatNumber(brand.credits)}</Text>
            </View>
          }
        />
      }
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[8] }}
      footer={
        <View style={styles.composerBar}>
          <View style={styles.composer}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("chat.addAssets")} onPress={() => router.push("/reels/assets")} style={styles.icon44}>
              <Plus size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder={t("chat.composerPlaceholder")}
              placeholderTextColor={color.inkMuted}
              accessibilityLabel={t("chat.composerA11y")}
              style={styles.input}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={t("chat.send")} onPress={() => setDraft("")} style={[styles.icon44, { backgroundColor: color.primary }]}>
              <ArrowUp size={20} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />
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

      <View style={{ alignItems: "flex-end", paddingTop: space[24] }}>
        <View style={styles.userBubble}>
          <Text style={[type.body, { color: color.onPrimary }]}>{t("chat.userMessage")}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", paddingTop: space[24] }}>
        <View style={styles.avatar}>
          <Sparkle size={20} color="#4C40BB" strokeWidth={ICON.strokeWidth} />
        </View>
        <View style={styles.reply}>
          <Text style={type.body}>
            <Trans t={t}
              ns="reels"
              i18nKey="chat.reply"
              values={{ brand: brand.name, product: "Acacia Bunting" }}
              components={{ b: <Text style={{ fontFamily: font.semibold }} /> }}
            />
          </Text>

          <View style={styles.product}>
            <Image source={photos.table} style={styles.productImg} contentFit="cover" accessibilityLabel="Table rectangulaire 240cm" />
            <View style={{ flex: 1 }}>
              <Text style={metaInk}>Table rectangulaire 240cm</Text>
              <Text style={[meta, { paddingTop: 2 }]}>Acacia Bunting · Bois & Chiffons</Text>
              <View style={styles.source}>
                <Text style={meta}>{t("sourceWebsite")}</Text>
              </View>
            </View>
          </View>

          <View style={{ paddingTop: space[20] }}>
            <Text style={meta}>{t("chat.format")}</Text>
            <View style={styles.options}>
              <Chip label={t("chat.formatVertical")} selected icon={<Smartphone size={20} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />} />
            </View>
            <Text style={[meta, { paddingTop: space[12] }]}>{t("chat.duration")}</Text>
            <View style={[styles.options, { paddingTop: 10 }]}>
              {DURATIONS.map((d) => (
                <Chip key={d} label={t("secondsShort", { seconds: d })} selected={d === duration} onPress={() => setDuration(d)} />
              ))}
            </View>
            <Text style={[meta, { paddingTop: space[12] }]}>{t("chat.presenter")}</Text>
            <View style={[styles.options, { paddingTop: 10 }]}>
              {PRESENTERS.map((p) => (
                <Chip
                  key={p}
                  label={t(p)}
                  selected={p === presenter}
                  onPress={() => (p === "aiActor" ? router.push("/reels/actor") : setPresenter(p))}
                />
              ))}
            </View>
          </View>

          <View style={styles.hook}>
            <Text style={eyebrow}>{t("chat.openingHook")}</Text>
            <Text style={[type.body, { paddingTop: 4 }]}>{ideas[0].hook}</Text>
          </View>

          <ActionButton
            style={{ marginTop: space[20] }}
            leading={Clapperboard}
            trailing={ArrowRight}
            label={t("chat.reviewStoryboard", { count: 3 })}
            onPress={() => router.push("/reels/storyboard")}
          />
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusDot} />
        <Text style={meta}>{t("chat.readyStatus")}</Text>
      </View>
    </ReelsScreen>
  );
}

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
  userBubble: { maxWidth: 290, paddingVertical: space[12], paddingHorizontal: space[16], borderRadius: radius.card, backgroundColor: rc.dark },
  avatar: {
    width: 28,
    height: 28,
    marginTop: 2,
    borderRadius: 14,
    backgroundColor: color.selection,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  reply: {
    flex: 1,
    marginLeft: space[12],
    padding: space[16],
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
    borderTopLeftRadius: 2,
    boxShadow: "0 2px 12px rgba(0,0,0,0.03)",
  },
  product: {
    marginTop: space[16],
    flexDirection: "row",
    alignItems: "center",
    padding: space[12],
    backgroundColor: rc.header,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
  },
  productImg: { width: 56, height: 56, marginRight: space[12], borderRadius: radius.control, backgroundColor: color.surface },
  source: { alignSelf: "flex-start", marginTop: 5, paddingHorizontal: space[8], borderRadius: radius.badge, backgroundColor: rc.tagGrey },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[8] },
  hook: {
    marginTop: space[16],
    padding: space[12],
    backgroundColor: "#FAF9FD",
    borderLeftWidth: 2,
    borderLeftColor: "#000",
    borderRadius: radius.control,
  },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[8], paddingTop: 28, paddingBottom: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: rc.tagGrey, opacity: 0.5 },
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
