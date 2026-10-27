import { Image } from "expo-image";
import { router } from "expo-router";
import { Images, Palette, Unplug } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { space, type } from "@/theme/tokens";
import { BizScreen, NavRow, SettingsCard, SettingsTabs, SimpleHeader, TextAction, bc, body12, strong14 } from "@/ui/business/kit";
import { attributes, business, media } from "@/ui/business/sample";
import { eyebrow, meta } from "@/ui/reels/kit";

/** M06 · Business / My Business: workspace identity, business attributes and settings links. */
export default function MyBusiness() {
  const { t } = useTranslation("business");
  return (
    <BizScreen
      gutter={space[20]}
      top={space[16]}
      header={
        <>
          <SimpleHeader title={t("kit.settingsTitle")} />
          <View style={styles.tabBand}>
            <SettingsTabs active="myBusiness" />
          </View>
        </>
      }
    >
      <SettingsCard style={styles.identity}>
        <View style={styles.logoTile}>
          <Image source={media.favicon} style={{ width: 32, height: 32 }} contentFit="contain" accessibilityLabel={t("kit.logoLabel", { name: business.name })} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.cardTitle}>{business.name}</Text>
          <Text style={meta}>{business.tagline}</Text>
        </View>
        <View style={{ marginRight: space[8] }}>
          <TextAction label={t("kit.edit")} onPress={() => router.push("/business/brand")} />
        </View>
      </SettingsCard>

      <SettingsCard style={{ marginTop: space[24], paddingTop: space[24] }}>
        <Text style={[eyebrow, { paddingBottom: 2 }]} accessibilityRole="header">
          {t("myBusiness.attributesTitle")}
        </Text>
        {attributes.map((a, i) => (
          <View key={a.id} style={[styles.attr, i < attributes.length - 1 && styles.attrRule]}>
            <Text style={meta}>{t(`myBusiness.attributes.${a.id}`)}</Text>
            <Text style={[a.strong ? strong14 : body12, styles.attrValue]}>{a.value}</Text>
          </View>
        ))}
      </SettingsCard>

      <SettingsCard style={styles.links}>
        <NavRow first icon={Palette} title={t("myBusiness.brandPreferences")} subtitle={t("myBusiness.brandPreferencesHint")} onPress={() => router.push("/business/brand")} />
        <NavRow icon={Images} title={t("myBusiness.photoAssets")} subtitle={t("myBusiness.photoAssetsHint")} onPress={() => router.push("/business/photos")} />
        <NavRow icon={Unplug} title={t("myBusiness.connections")} subtitle={t("myBusiness.connectionsHint")} onPress={() => router.push("/business/connections")} />
      </SettingsCard>
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  tabBand: {
    paddingHorizontal: space[16],
    paddingVertical: space[8],
    backgroundColor: "rgba(255,255,255,0.5)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(233,233,240,0.6)",
  },
  identity: { flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[16] },
  logoTile: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: bc.black },
  attr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[16], minHeight: 36, marginTop: space[12] },
  attrRule: { borderBottomWidth: 1, borderBottomColor: bc.rowRule },
  attrValue: { flexShrink: 1, textAlign: "right" },
  links: { marginTop: space[24], paddingHorizontal: space[12], paddingVertical: space[12] },
});
