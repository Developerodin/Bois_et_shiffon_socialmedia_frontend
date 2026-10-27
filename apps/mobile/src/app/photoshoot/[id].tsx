import { Image } from "expo-image";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Columns2, Download, Ellipsis, ExternalLink, Link, Maximize, Share2, Sparkle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Share, StyleSheet, Text, View } from "react-native";
import { BackButton, BrandChip, Glow, HeaderIcon, ps, STROKE, TopBar } from "@/ui/photoshoot/chrome";
import { Badge, IconLabelButton, Page, PhotoPill } from "@/ui/photoshoot/controls";
import { findShoot, say } from "@/ui/photoshoot/sample";
import { color, radius, space, type } from "@/theme/tokens";

/**
 * F07 · Photoshoot / Result detail. Download, compare, expand and more-options have no backend or
 * design yet and are inert; Variation starts another (sample) generation; Share uses the OS sheet.
 */
export default function ResultDetail() {
  const { t } = useTranslation("photoshoot");
  const { id } = useLocalSearchParams<{ id: string }>();
  const shoot = findShoot(id);
  if (!shoot || shoot.status !== "preview") return <Redirect href="/photoshoot/results" />;
  const title = say(t, shoot.title);

  return (
    <Page
      background={<Glow blobs={[{ x: 48, y: 32, size: 192, color: "#E9E4F5", opacity: 0.6 }, { x: 342, y: 120, size: 176, color: "#FCEEE7", opacity: 0.5 }]} />}
      header={
        <TopBar
          leading={
            <View style={{ marginLeft: -8, marginRight: 2 }}>
              <BackButton icon={ChevronLeft} />
            </View>
          }
          title={shoot.headerTitle ? say(t, shoot.headerTitle) : undefined}
          trailing={
            <View style={styles.headerRight}>
              <BrandChip />
              <HeaderIcon icon={Ellipsis} label={t("detail.moreOptions")} />
            </View>
          }
        />
      }
      contentStyle={{ paddingTop: space[8], paddingBottom: space[24] }}
      footer={
        <View style={styles.actions}>
          <IconLabelButton label={t("detail.downloadPhoto")} icon={Download} style={{ flex: 1, paddingHorizontal: 0 }} />
          <IconLabelButton label={t("detail.variation")} icon={Sparkle} variant="outline" bold onPress={() => router.push("/photoshoot/generating")} />
          <HeaderIcon icon={Share2} label={t("detail.share")} onPress={() => void Share.share({ message: `${title} · ${shoot.sourceLine}` })} />
        </View>
      }
    >
      <View style={[styles.card, { padding: space[8] }]}>
        <View style={styles.photo}>
          {shoot.image ? <Image source={shoot.image} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={title} /> : null}
          <PhotoPill dot="rgba(0,0,0,0.5)" style={{ top: 12, left: 12, borderColor: "rgba(255,255,255,0.6)" }}>
            {t("detail.samplePreview")}
          </PhotoPill>
          {shoot.formatBadge ? (
            <PhotoPill muted style={{ top: 14, right: 12, backgroundColor: "rgba(255,255,255,0.8)", borderColor: "rgba(255,255,255,0.4)" }}>
              {say(t, shoot.formatBadge)}
            </PhotoPill>
          ) : null}
          <View style={styles.photoActions}>
            <IconLabelButton label={t("detail.compareOriginal")} icon={Columns2} variant="dark" height={44} style={{ paddingHorizontal: space[12] }} />
            <View style={styles.darkIcon}>
              <HeaderIcon icon={Maximize} label={t("detail.expandView")} tint={color.onPrimary} />
            </View>
          </View>
        </View>
        <View style={styles.tags}>
          {shoot.tags?.map((tag, i) => (
            <Badge key={i} style={styles.tag}>
              {say(t, tag)}
            </Badge>
          ))}
        </View>
      </View>

      <View style={[styles.card, styles.section]}>
        <View style={styles.rowBetween}>
          <Text style={[type.cardTitle, { letterSpacing: -0.24 }]} accessibilityRole="header">
            {t("detail.stagingSummary")}
          </Text>
          {shoot.style ? <Badge>{say(t, shoot.style)}</Badge> : null}
        </View>
        <Text style={[type.body, { paddingTop: space[12] }]}>{shoot.summary}</Text>
        <View style={styles.source}>
          <View style={styles.sourceLeft}>
            <Link size={16} color={color.inkSecondary} strokeWidth={STROKE} />
            <Text style={type.meta} numberOfLines={1}>
              {shoot.sourceLine}
            </Text>
          </View>
          <ExternalLink size={16} color={color.inkSecondary} strokeWidth={STROKE} />
        </View>
      </View>

      <View style={[styles.card, styles.section]}>
        <View style={styles.rowBetween}>
          <Text style={type.meta}>{t("detail.format")}</Text>
          <Text style={[type.meta, { color: color.ink }]}>{shoot.format ? say(t, shoot.format) : null}</Text>
        </View>
        <View style={[styles.rowBetween, { paddingTop: space[8] }]}>
          <Text style={type.meta}>{t("detail.creationCost")}</Text>
          <Text style={[type.meta, { color: color.ink }]}>{t("detail.credits", { count: shoot.cost })}</Text>
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: "row", alignItems: "center", gap: 14, marginRight: -8 },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: ps.border,
    borderRadius: radius.card,
    shadowColor: "#23182F",
    shadowOpacity: 0.01,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  section: { marginTop: space[24], padding: space[20] },
  photo: { aspectRatio: 4 / 5, borderRadius: radius.control, overflow: "hidden", backgroundColor: ps.chip },
  photoActions: { position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  darkIcon: { backgroundColor: ps.dark, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: space[12], paddingHorizontal: space[4], paddingBottom: space[4] },
  tag: { paddingVertical: space[4], paddingHorizontal: space[12] },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  source: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space[12], paddingTop: space[8], borderTopWidth: 1, borderTopColor: ps.hairline },
  sourceLeft: { flexDirection: "row", alignItems: "center", gap: space[8], flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8], paddingBottom: space[8] },
});
