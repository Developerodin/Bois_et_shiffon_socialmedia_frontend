import { Image } from "expo-image";
import { router } from "expo-router";
import { Images, Package, Palette, Unplug } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { color, space, type } from "@/theme/tokens";
import { BizScreen, NavRow, SettingsCard, SettingsTabs, SimpleHeader, TextAction, bc, body12, strong14 } from "@/ui/business/kit";
import { siteLabel, useCurrentBrand } from "@/ui/use-current-brand";
import { eyebrow, meta } from "@/ui/reels/kit";

/** M06 · Business / My Business: the business's identity, what Research and onboarding know about it, and settings links. */
export default function MyBusiness() {
  const { t } = useTranslation("business");
  const brand = useCurrentBrand();
  const view = brand?.view;
  const site = siteLabel(view?.website);
  // Only what's known: a business without a website or Maps listing shows fewer rows.
  const attributes = [
    { id: "location", value: view?.location, strong: false },
    { id: "audience", value: view?.summary?.audience, strong: true },
    { id: "category", value: view?.category, strong: true },
    { id: "tags", value: view?.summary?.tags.join(", "), strong: true },
    { id: "website", value: site, strong: true },
  ].filter((a): a is { id: string; value: string; strong: boolean } => !!a.value);
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
          <Image source={brand?.logoUrl ? { uri: brand.logoUrl } : undefined} style={{ width: 32, height: 32 }} contentFit="contain" accessibilityLabel={t("kit.logoLabel", { name: brand?.name ?? "" })} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.cardTitle}>{brand?.name ?? ""}</Text>
          {view?.summary?.tagline ? <Text style={meta}>{view.summary.tagline}</Text> : null}
        </View>
        <View style={{ marginRight: space[8] }}>
          <TextAction label={t("kit.edit")} onPress={() => router.push("/business/brand")} />
        </View>
      </SettingsCard>

      <SettingsCard style={{ marginTop: space[24], paddingTop: space[24] }}>
        <Text style={[eyebrow, { paddingBottom: 2 }]} accessibilityRole="header">
          {t("myBusiness.attributesTitle")}
        </Text>
        {!view ? <ActivityIndicator color={color.primary} style={{ marginTop: space[12] }} /> : null}
        {view && attributes.length === 0 ? <Text style={[meta, { paddingTop: space[12] }]}>{t("myBusiness.noAttributes")}</Text> : null}
        {attributes.map((a, i) => (
          <View key={a.id} style={[styles.attr, i < attributes.length - 1 && styles.attrRule]}>
            <Text style={meta}>{t(`myBusiness.attributes.${a.id}`)}</Text>
            <Text style={[a.strong ? strong14 : body12, styles.attrValue]}>{a.value}</Text>
          </View>
        ))}
      </SettingsCard>

      <SettingsCard style={styles.links}>
        <NavRow first icon={Palette} title={t("myBusiness.brandPreferences")} subtitle={t("myBusiness.brandPreferencesHint")} onPress={() => router.push("/business/brand")} />
        <NavRow icon={Package} title={t("myBusiness.products")} subtitle={t("myBusiness.productsHint")} onPress={() => router.push("/business/products")} />
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
