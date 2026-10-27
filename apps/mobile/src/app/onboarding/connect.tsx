import { Image } from "expo-image";
import { router } from "expo-router";
import { CircleCheck, Download, Hash, Lock, SlidersHorizontal, Star, Video } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { images } from "@/ui/icons";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { sampleProfile } from "@/ui/onboarding/profile";
import { color, radius, space, type } from "@/theme/tokens";

/** A12 · Onboarding / Connect Instagram (Figma 408:896) with A13 "Connect later?" sheet (408:981). */
export default function Connect() {
  const { t } = useTranslation("onboarding");
  const [skipSheet, setSkipSheet] = useState(false);
  const finish = () => router.replace("/posts");

  return (
    <Screen
      header={<StepHeader step={5} />}
      footer={
        <>
          {/* ponytail: Instagram/Facebook OAuth runs through the web app's Settings → Connections today;
              the mobile flow opens it once the API client lands. */}
          <Button label={t("connect.connectInstagram")} icon={require("../../../assets/figma/onboarding/logo-instagram.png")} onPress={finish} />
          <Button label={t("connect.connectFacebook")} variant="outline" icon={require("../../../assets/figma/onboarding/logo-facebook.png")} onPress={finish} />
          <Button label={t("connect.skip")} variant="ghost" height={56} onPress={() => setSkipSheet(true)} />
        </>
      }
    >
      <View style={styles.brand}>
        <Image source={images.bcFavicon} style={{ width: 16, height: 16 }} contentFit="contain" />
        <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{sampleProfile.name}</Text>
        <Text style={type.meta}>{t("connect.readyToConnect")}</Text>
      </View>

      <Title
        title={t("connect.title")}
        subtitle={t("connect.subtitle")}
        style={{ paddingTop: space[16] }}
      />

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <CircleCheck size={16} color={color.ink} strokeWidth={1.75} />
          <Text style={[type.meta, { color: color.ink, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 }]}>{t("connect.toolsTitle")}</Text>
        </View>
        <Feature icon={<Video size={16} color={color.ink} strokeWidth={1.75} />} text={t("connect.featureReels")} />
        <Feature icon={<Hash size={16} color={color.ink} strokeWidth={1.75} />} text={t("connect.featureCaptions")} />
        <Feature icon={<Star size={16} color={color.ink} strokeWidth={1.75} />} text={t("connect.featureReview")} big last />
      </View>

      <View style={styles.assure}>
        <Lock size={14} color={color.inkSecondary} strokeWidth={1.75} />
        <Text style={type.meta}>{t("connect.assurance")}</Text>
      </View>

      <Modal visible={skipSheet} transparent animationType="slide" onRequestClose={() => setSkipSheet(false)}>
        <Pressable style={styles.scrim} onPress={() => setSkipSheet(false)} accessibilityLabel={t("common:close")} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetBrand}>
            <Image source={images.bcFavicon} style={{ width: 14, height: 14 }} contentFit="contain" />
            <Text style={[type.meta, { color: color.ink }]}>{sampleProfile.name}</Text>
          </View>
          <Text style={[type.pageTitle, { paddingTop: space[12] }]}>{t("connect.laterTitle")}</Text>
          <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[8] }]}>
            {t("connect.laterBody")}
          </Text>
          <View style={styles.tiles}>
            <Tile icon={<Download size={18} color={color.ink} strokeWidth={1.75} />} text={t("connect.laterDownload")} />
            <Tile icon={<SlidersHorizontal size={18} color={color.ink} strokeWidth={1.75} />} text={t("connect.laterSettings")} />
          </View>
          <Button label={t("connect.continueWithout")} onPress={() => { setSkipSheet(false); finish(); }} />
          <Button label={t("connect.connectInstagram")} variant="outline" style={{ marginTop: space[12] }} onPress={() => setSkipSheet(false)} />
        </View>
      </Modal>
    </Screen>
  );
}

function Feature({ icon, text, big, last }: { icon: ReactNode; text: string; big?: boolean; last?: boolean }) {
  return (
    <View style={[styles.feature, !last && styles.featureRule]}>
      <View style={styles.featureIcon}>{icon}</View>
      <Text style={[big ? type.body : [type.meta, { color: color.ink }], { flex: 1 }]}>{text}</Text>
    </View>
  );
}

function Tile({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={styles.tile}>
      {icon}
      <Text style={[type.meta, { color: color.ink, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: space[8], paddingHorizontal: space[12], backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: color.divider, borderRadius: radius.round },
  card: { padding: space[16], backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, borderRadius: radius.card },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space[8], paddingBottom: space[8] },
  feature: { flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[12] },
  featureRule: { borderBottomWidth: 1, borderBottomColor: color.divider },
  featureIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  assure: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: space[32] },
  scrim: { flex: 1, backgroundColor: "rgba(16,16,20,0.4)" },
  sheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space[24], paddingTop: space[12], paddingBottom: space[32] },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: color.disabledBg, marginBottom: space[16] },
  sheetBrand: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: space[4], paddingHorizontal: space[8], borderWidth: 1, borderColor: color.divider, borderRadius: radius.round },
  tiles: { flexDirection: "row", gap: space[12], paddingVertical: space[20] },
  tile: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[8], padding: space[12], borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
});
