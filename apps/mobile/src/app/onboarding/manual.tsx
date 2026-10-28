import { router } from "expo-router";
import { MapPin } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { onboarding } from "@/ui/onboarding/state";
import { color, space, type } from "@/theme/tokens";

const strong = { ...type.label, fontFamily: "Inter_600SemiBold", paddingBottom: space[8] } as const;
const optional = { ...strong, color: color.inkSecondary } as const;

/**
 * A07 · Onboarding / No website (Figma 408:418, "Describe business" mode). People with a site pick Website on
 * A05, so this asks only what Research needs to find the business online: name, what it sells, where.
 */
export default function Manual() {
  const { t } = useTranslation("onboarding");
  const [name, setName] = useState(onboarding.business?.name ?? "");
  const [sells, setSells] = useState(onboarding.business?.sells ?? "");
  const [location, setLocation] = useState(onboarding.business?.location ?? "");
  const ready = name.trim().length > 1 && sells.trim().length > 3;

  function next() {
    onboarding.business = { name: name.trim(), sells: sells.trim(), location: location.trim() || undefined };
    onboarding.place = undefined; // described by hand: not the Maps listing picked earlier, if any
    router.push({ pathname: "/onboarding/learning", params: { name: name.trim() } });
  }

  return (
    <Screen header={<StepHeader step={2} />} footer={<Button label={t("common:continue")} arrow disabled={!ready} onPress={next} />}>
      <Title title={t("manual.title")} subtitle={t("manual.subtitle")} style={{ paddingBottom: 0 }} />
      <View style={{ paddingTop: space[20], gap: space[16] }}>
        <View>
          <Text style={strong}>{t("manual.nameLabel")}</Text>
          <Field placeholder={t("manual.namePlaceholder")} value={name} onChangeText={setName} height={48} autoCapitalize="words" maxLength={80} />
        </View>
        <View>
          <Text style={strong}>{t("manual.sellsLabel")}</Text>
          <Field placeholder={t("manual.sellsPlaceholder")} value={sells} onChangeText={setSells} multiline maxLength={500} />
        </View>
        <View>
          <Text style={optional}>{t("manual.locationLabel")}</Text>
          <Field
            placeholder={t("manual.locationPlaceholder")}
            value={location}
            onChangeText={setLocation}
            height={48}
            maxLength={120}
            leading={<MapPin size={16} color={color.disabledInk} strokeWidth={1.75} />}
          />
        </View>
      </View>
    </Screen>
  );
}
