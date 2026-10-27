import { useState } from "react";
import { Image } from "expo-image";
import { Bot, Info, ShieldCheck, SlidersHorizontal } from "lucide-react-native";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { color, font, radius, space, type } from "@/theme/tokens";
import { TextButton, TitleHeader, mc, title16 } from "@/ui/marketing/kit";
import { brand, photos, replyExample } from "@/ui/marketing/sample";
import { ICON, Panel, ReelsScreen, bodyMuted, eyebrow, meta, metaInk, rc } from "@/ui/reels/kit";

/**
 * M03 · Customers / Reply assistant, in example mode: no messaging channel is connected, so the
 * draft can be edited locally but never sent.
 */
export default function ReplyAssistant() {
  const { t } = useTranslation("marketing");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(replyExample.draft);
  const { product, customer, tone } = replyExample;

  return (
    <ReelsScreen
      bg={color.canvas}
      glow={false}
      header={
        <TitleHeader
          title={t("reply.title")}
          fallback="/marketing/inbox"
          right={
            <View style={styles.avatarTarget} accessibilityLabel={t("shared.workspace", { name: brand.name })}>
              <View style={styles.brandAvatar}>
                <Image source={photos.bcFavicon} style={{ width: 16, height: 16, borderRadius: 3 }} contentFit="contain" />
              </View>
            </View>
          }
        />
      }
      contentStyle={{ paddingTop: space[16] }}
    >
      <Panel style={styles.product}>
        <Image source={photos.diningTable} style={styles.productImage} contentFit="cover" accessibilityLabel={t("shared.diningTableImage")} />
        <View style={{ flex: 1 }}>
          <Text style={eyebrow}>{t("reply.referencedProduct")}</Text>
          <Text style={[title16, { fontSize: 15, lineHeight: 20, paddingTop: 2 }]}>{product.name}</Text>
          <Text style={[meta, { fontSize: 13, paddingTop: 2 }]}>{product.source}</Text>
        </View>
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <View style={{ flexDirection: "row", gap: space[12], alignItems: "flex-start" }}>
          <View style={styles.customer}>
            <Text style={[meta, { fontSize: 13 }]}>{customer.initial}</Text>
          </View>
          <View style={styles.bubble}>
            <Text style={meta}>{customer.meta}</Text>
            <Text style={[metaInk, { paddingTop: 2 }]}>{customer.message}</Text>
          </View>
        </View>

        <View style={styles.suggestion}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], flexShrink: 1 }}>
              <Bot size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
              <Text style={styles.suggestionTitle}>{t("reply.suggestionTitle")}</Text>
            </View>
            <Text style={meta}>{t("shared.draft")}</Text>
          </View>
          {editing ? (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              autoFocus
              accessibilityLabel={t("reply.draftLabel")}
              style={[styles.draftBox, styles.draftText, { borderColor: color.primary }]}
            />
          ) : (
            <View style={styles.draftBox}>
              <Text style={styles.draftText}>{draft}</Text>
            </View>
          )}
          <View style={[styles.rowBetween, { paddingTop: space[12] }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], flexShrink: 1 }}>
              <SlidersHorizontal size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
              <Text style={metaInk}>{t("reply.tone", { tone: t(`reply.tones.${tone}`) })}</Text>
            </View>
            <TextButton label={editing ? t("reply.done") : t("reply.editReply")} onPress={() => setEditing((e) => !e)} labelStyle={{ fontSize: 14 }} />
          </View>
        </View>
      </Panel>

      <Panel style={[styles.notice, { marginTop: space[24] }]}>
        <ShieldCheck size={20} color={color.ink} strokeWidth={ICON.strokeWidth} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={[title16, { fontSize: 15 }]}>{t("reply.approvalTitle")}</Text>
          <Text style={[bodyMuted, { paddingTop: 2 }]}>{t("reply.approvalBody")}</Text>
        </View>
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
          <Info size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
          <Text style={styles.suggestionTitle}>{t("reply.exampleTitle")}</Text>
        </View>
        <Text style={[bodyMuted, { paddingTop: space[12] }]}>{t("reply.exampleBody")}</Text>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  avatarTarget: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  brandAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: rc.border,
  },
  product: { flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[12], paddingHorizontal: space[12] },
  productImage: { width: 56, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
  customer: { width: 28, height: 28, borderRadius: 14, backgroundColor: mc.avatar, alignItems: "center", justifyContent: "center", marginTop: 1 },
  bubble: {
    flexShrink: 1,
    paddingVertical: space[8],
    paddingHorizontal: space[12],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: rc.border,
  },
  suggestion: {
    marginTop: space[16],
    padding: space[20],
    paddingBottom: space[12],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: rc.border,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  suggestionTitle: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.inkSecondary, flexShrink: 1 },
  draftBox: { marginTop: space[12], padding: space[12], borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
  draftText: { ...type.body, fontSize: 14 },
  notice: { flexDirection: "row", gap: space[12] },
});
