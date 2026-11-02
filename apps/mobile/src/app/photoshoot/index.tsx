import { Image, type ImageSource } from "expo-image";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Button } from "@/ui/button";
import { Card } from "@/ui/layout";
import { BottomNav, BusinessSwitch, Glow, ModuleHeader } from "@/ui/photoshoot/chrome";
import { Page, PhotoPill } from "@/ui/photoshoot/controls";
import { photoshootImages } from "@/ui/photoshoot/sample";
import { color, space, type } from "@/theme/tokens";

/** F01 · Photoshoot / Create. */
export default function PhotoshootCreate() {
  const { t } = useTranslation("photoshoot");
  return (
    <Page
      background={<Glow blobs={[{ x: 30, y: 180, size: 256, color: "#EAE7FA", opacity: 0.55 }, { x: 345, y: 215, size: 224, color: "#FCECE4", opacity: 0.6 }]} />}
      header={<ModuleHeader />}
      bottom={<BottomNav active="create" />}
    >
      <BusinessSwitch />
      <View style={{ paddingTop: space[16] }}>
        <Text style={type.pageTitle} accessibilityRole="header">
          {t("create.title")}
        </Text>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[4] }]}>{t("create.subtitle")}</Text>
      </View>

      <ShootCard
        style={{ marginTop: space[20] }}
        image={photoshootImages.diningTable}
        imageLabel={t("create.product.imageLabel", { name: "Bois & Chiffons Bunting Acacia" })}
        pill={t("create.product.pill")}
        title={t("create.product.title")}
        body={t("create.product.body")}
        cta={t("create.product.cta")}
        href="/photoshoot/product"
      />
      <ShootCard
        style={{ marginTop: space[16], marginBottom: space[12] }}
        image={photoshootImages.fashionStudio}
        imageLabel={t("create.fashion.imageLabel")}
        illustration
        title={t("create.fashion.title")}
        body={t("create.fashion.body")}
        cta={t("create.fashion.cta")}
        href="/photoshoot/fashion"
      />
    </Page>
  );
}

function ShootCard({
  image,
  imageLabel,
  illustration,
  pill,
  title,
  body,
  cta,
  href,
  style,
}: {
  image: ImageSource;
  imageLabel: string;
  illustration?: boolean;
  pill?: string;
  title: string;
  body: string;
  cta: string;
  href: Href;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card style={[styles.card, style]}>
      <View style={[styles.media, illustration && styles.illustrationBg]}>
        <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={imageLabel} />
        {pill ? <PhotoPill muted style={{ top: 10, left: 10 }}>{pill}</PhotoPill> : null}
      </View>
      <View style={styles.copy}>
        <Text style={[type.cardTitle, { letterSpacing: -0.24 }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[type.body, { color: color.inkSecondary }]}>{body}</Text>
      </View>
      <Button label={cta} arrow onPress={() => router.push(href)} style={{ marginTop: space[16] }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    shadowColor: "#23182F",
    shadowOpacity: 0.01,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  media: { height: 212, marginTop: -space[20], marginHorizontal: -space[20], marginBottom: space[20], backgroundColor: color.canvasAlt },
  illustrationBg: { backgroundColor: "#F5F3FA" },
  copy: { gap: space[4], paddingHorizontal: 2, paddingBottom: space[16] },
});
