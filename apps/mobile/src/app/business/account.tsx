import { router } from "expo-router";
import { session } from "@/api/client";
import { Bell, ChevronDown, CircleQuestionMark, FileText, Languages, LogOut, RotateCcw, ShieldCheck, Users } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, NavRow, SectionHead, SettingsCard, SmallButton, Toggle, bc, body12, label14, strong14 } from "@/ui/business/kit";
import { business } from "@/ui/business/sample";
import { useAppLanguage } from "@/ui/language/languages";
import { ActionButton, ICON, bodyMuted, meta } from "@/ui/reels/kit";

/** M12 · Business / Account settings: workspace, preferences, support and sign-out. */
export default function AccountSettings() {
  const { t } = useTranslation("business");
  const lang = useAppLanguage();
  const [push, setPush] = useState(true);

  return (
    <BizScreen top={space[24]} header={<BrandHeader title={t("account.title")} />}>
      <SectionHead title={t("account.workspaceTitle")} style={{ paddingBottom: space[8] }} />
      <SettingsCard style={styles.card}>
        <View style={styles.between}>
          <View style={{ flex: 1 }}>
            <Text style={meta}>{t("account.workspaceName")}</Text>
            <Text style={[strong14, { paddingTop: 2 }]}>{business.workspace}</Text>
          </View>
          <SmallButton label={t("kit.edit")} style={{ borderColor: color.divider }} />
        </View>
        <View style={[styles.between, styles.team]}>
          <View style={styles.inline}>
            <Users size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            <Text style={body12}>{t("account.teamTitle")}</Text>
          </View>
          <Text style={meta}>{t("account.teamMembers")}</Text>
        </View>
      </SettingsCard>

      <SectionHead title={t("account.preferencesTitle")} style={{ marginTop: space[20], paddingBottom: space[8] }} />
      <SettingsCard style={styles.list}>
        <View style={[styles.pref, { paddingVertical: space[16] }]}>
          <Languages size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
          <View style={{ flex: 1 }}>
            <Text style={body12}>{t("account.languageTitle")}</Text>
            <Text style={meta}>{t("account.languageBody")}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("account.languageLabel", { language: lang.native })}
            accessibilityHint={t("account.languageHint")}
            onPress={() => router.push("/business/language")}
            style={({ pressed }) => [styles.select, pressed && { opacity: 0.85 }]}
          >
            <Text style={[strong14, { flexShrink: 1 }]}>{lang.native}</Text>
            <ChevronDown size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </Pressable>
        </View>
        <View style={[styles.pref, styles.rule]}>
          <Bell size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
          <View style={{ flex: 1 }}>
            <Text style={body12}>{t("account.pushTitle")}</Text>
            <Text style={meta}>{t("account.pushBody")}</Text>
          </View>
          <Toggle label={t("account.pushTitle")} value={push} onValueChange={setPush} />
        </View>
      </SettingsCard>

      <SectionHead title={t("account.supportTitle")} style={{ marginTop: space[20], paddingBottom: space[8] }} />
      <SettingsCard style={styles.list}>
        <NavRow first icon={CircleQuestionMark} title={t("account.help")} titleStyle={styles.supportLabel} style={styles.support} />
        <NavRow icon={FileText} title={t("account.terms")} titleStyle={styles.supportLabel} style={styles.support} />
        <NavRow icon={ShieldCheck} title={t("account.privacy")} titleStyle={styles.supportLabel} style={styles.support} />
        <NavRow icon={RotateCcw} title={t("account.restore")} titleStyle={styles.supportLabel} style={styles.support} />
      </SettingsCard>

      <ActionButton
        label={t("account.signOut")}
        variant="outline"
        leading={LogOut}
        height={44}
        labelStyle={{ fontFamily: font.semibold }}
        style={{ marginTop: space[20] }}
        onPress={() => void session.signOut().then(() => router.replace("/onboarding/sign-in"))}
      />
      <Text style={[bodyMuted, { textAlign: "center", paddingTop: space[12], paddingHorizontal: space[8] }]}>
        {t("account.signOutNote")}
      </Text>
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: color.divider, paddingVertical: space[20] },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[12] },
  inline: { flexDirection: "row", alignItems: "center", gap: space[8] },
  team: { marginTop: space[12], paddingTop: space[12], borderTopWidth: 1, borderTopColor: "#F0F0F3" },
  list: { padding: 0, overflow: "hidden", borderColor: color.divider },
  pref: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 77, paddingHorizontal: space[16] },
  rule: { borderTopWidth: 1, borderTopColor: "#F0F0F3" },
  select: {
    width: 120,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingHorizontal: space[12],
    borderRadius: radius.control,
    backgroundColor: bc.tile,
  },
  support: { minHeight: 45, paddingHorizontal: space[16], paddingVertical: 0 },
  supportLabel: { ...label14, color: color.ink },
});
