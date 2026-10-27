import { router } from "expo-router";
import { Link2, MapPin } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { normalizeWebsite } from "@/ui/onboarding/website";
import { onboarding } from "@/ui/onboarding/state";
import { Segmented } from "@/ui/segmented";
import { color, space, type } from "@/theme/tokens";

const strong = { ...type.label, fontFamily: "Inter_600SemiBold", paddingBottom: space[8] } as const;
const optional = { ...strong, color: color.inkSecondary } as const;

/** A07 · Onboarding / Manual or listing (Figma 408:418). */
export default function Manual() {
  const { t } = useTranslation("onboarding");
  const [mode, setMode] = useState<"listing" | "describe">("describe");
  const [listing, setListing] = useState("");
  const [name, setName] = useState("");
  const [sells, setSells] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");

  const listingUrl = normalizeWebsite(listing);
  const ready = mode === "listing" ? !!listingUrl : name.trim().length > 1 && sells.trim().length > 3;

  function next() {
    if (mode === "listing" && listingUrl) {
      onboarding.website = listingUrl;
      return router.push({ pathname: "/onboarding/learning", params: { site: listingUrl } });
    }
    onboarding.business = { name: name.trim(), sells: sells.trim(), location: location.trim() || undefined, website: normalizeWebsite(website) ?? undefined };
    router.push({ pathname: "/onboarding/learning", params: { name: name.trim() } });
  }

  return (
    <Screen header={<StepHeader step={2} />} footer={<Button label={t("common:continue")} arrow disabled={!ready} onPress={next} />}>
      <Title title={t("manual.title")} subtitle={t("manual.subtitle")} style={{ paddingBottom: 0 }} />
      <View style={{ paddingTop: space[16] }}>
        <Segmented
          label={t("manual.modeLabel")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "listing", label: t("manual.modeListing") },
            { value: "describe", label: t("manual.modeDescribe") },
          ]}
        />
      </View>

      {mode === "listing" ? (
        <View style={{ paddingTop: space[20] }}>
          <Text style={strong}>{t("manual.listingLabel")}</Text>
          <Field placeholder={t("manual.listingPlaceholder")} value={listing} onChangeText={setListing} keyboardType="url" autoCapitalize="none" autoCorrect={false} height={48} />
        </View>
      ) : (
        <View style={{ paddingTop: space[20], gap: space[16] }}>
          <View>
            <Text style={strong}>{t("manual.nameLabel")}</Text>
            <Field placeholder={t("manual.namePlaceholder")} value={name} onChangeText={setName} height={48} autoCapitalize="words" />
          </View>
          <View>
            <Text style={strong}>{t("manual.sellsLabel")}</Text>
            <Field placeholder={t("manual.sellsPlaceholder")} value={sells} onChangeText={setSells} multiline />
          </View>
          <View>
            <Text style={optional}>{t("manual.locationLabel")}</Text>
            <Field
              placeholder={t("manual.locationPlaceholder")}
              value={location}
              onChangeText={setLocation}
              height={48}
              leading={<MapPin size={16} color={color.disabledInk} strokeWidth={1.75} />}
            />
          </View>
          <View>
            <Text style={[type.meta, { paddingBottom: space[8] }]}>{t("manual.websiteLabel")}</Text>
            <Field
              placeholder="https://example.com"
              value={website}
              onChangeText={setWebsite}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              height={48}
              leading={<Link2 size={16} color={color.disabledInk} strokeWidth={1.75} />}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}
