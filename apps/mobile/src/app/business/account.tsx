import { router } from "expo-router";
import { Bell, ChevronDown, CircleQuestionMark, FileText, Languages, LogOut, RotateCcw, ShieldCheck, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, NavRow, SectionHead, SettingsCard, Toggle, bc, body12, label14, strong14 } from "@/ui/business/kit";
import { me, workspaceMemberCount } from "@/api/endpoints";
import { useCurrentBrand } from "@/ui/use-current-brand";
import { disablePush, enablePush, pushActive, pushAvailable, pushRestored } from "@/ui/push";
import { useAppLanguage } from "@/ui/language/languages";
import { ActionButton, ICON, bodyMuted, meta } from "@/ui/reels/kit";
import { signOut } from "@/ui/account-actions";
import { resetTo } from "@/ui/reset-stack";

/** M12 · Business / Account settings: workspace, preferences, support and sign-out. */
export default function AccountSettings() {
  const { t } = useTranslation("business");
  const lang = useAppLanguage();
  const brand = useCurrentBrand();
  const [workspace, setWorkspace] = useState<{ name: string; members: number | null } | null>(null);
  useEffect(() => {
    if (!brand) return;
    let live = true;
    Promise.all([me(), workspaceMemberCount().catch(() => null)]).then(
      ([m, members]) => live && setWorkspace({ name: m.workspaces.find((w) => w.id === brand.workspaceId)?.name ?? "", members }),
      () => {},
    );
    return () => void (live = false);
  }, [brand?.workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Push is on once this phone registered (enablePush asks the system first); a build without it can't turn it on.
  const [push, setPush] = useState(pushActive);
  useEffect(() => void pushRestored.then(() => setPush(pushActive())), []);
  const togglePush = async (on: boolean) => {
    if (on) await enablePush();
    else await disablePush();
    setPush(pushActive());
  };

  return (
    <BizScreen top={space[24]} header={<BrandHeader title={t("account.title")} />}>
      <SectionHead title={t("account.workspaceTitle")} style={{ paddingBottom: space[8] }} />
      <SettingsCard style={styles.card}>
        <View style={styles.between}>
          <View style={{ flex: 1 }}>
            <Text style={meta}>{t("account.workspaceName")}</Text>
            <Text style={[strong14, { paddingTop: 2 }]}>{workspace?.name ?? ""}</Text>
          </View>
        </View>
        <View style={[styles.between, styles.team]}>
          <View style={styles.inline}>
            <Users size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            <Text style={body12}>{t("account.teamTitle")}</Text>
          </View>
          <Text style={meta}>{workspace?.members != null ? t("account.memberCount", { count: workspace.members }) : t("account.teamMembers")}</Text>
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
            <Text style={meta}>{pushAvailable() ? t("account.pushBody") : t("account.pushUnavailable")}</Text>
          </View>
          <Toggle label={t("account.pushTitle")} value={push} onValueChange={(v) => void togglePush(v)} disabled={!pushAvailable()} />
        </View>
      </SettingsCard>

      <SectionHead title={t("account.supportTitle")} style={{ marginTop: space[20], paddingBottom: space[8] }} />
      <SettingsCard style={styles.list}>
        <NavRow first icon={CircleQuestionMark} title={t("account.help")} soon={t("account.comingSoon")} titleStyle={styles.supportLabel} style={styles.support} />
        <NavRow icon={FileText} title={t("account.terms")} soon={t("account.comingSoon")} titleStyle={styles.supportLabel} style={styles.support} />
        <NavRow icon={ShieldCheck} title={t("account.privacy")} soon={t("account.comingSoon")} titleStyle={styles.supportLabel} style={styles.support} />
        <NavRow icon={RotateCcw} title={t("account.restore")} soon={t("account.comingSoon")} titleStyle={styles.supportLabel} style={styles.support} />
      </SettingsCard>

      <ActionButton
        label={t("account.signOut")}
        variant="outline"
        leading={LogOut}
        height={44}
        labelStyle={{ fontFamily: font.semibold }}
        style={{ marginTop: space[20] }}
        onPress={() => void signOut().then(() => resetTo("/onboarding/sign-in"))}
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
