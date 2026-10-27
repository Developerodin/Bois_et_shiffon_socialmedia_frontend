import { router } from "expo-router";
import { Ellipsis, Globe, MapPin, Package, SquarePen, Store } from "lucide-react-native";
import { useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/ui/button";
import { OptionRow } from "@/ui/choice";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { onboarding, type Source } from "@/ui/onboarding/state";
import { color, space } from "@/theme/tokens";

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
// key → onboarding:source.options.<key>.title / .description
const SOURCES: { id: Source; key: string; icon: Icon }[] = [
  { id: "website", key: "website", icon: Globe },
  { id: "google-maps", key: "googleMaps", icon: MapPin },
  { id: "marketplace", key: "marketplace", icon: Store },
  { id: "wholesale", key: "wholesale", icon: Package },
  { id: "none", key: "none", icon: SquarePen },
  { id: "other", key: "other", icon: Ellipsis },
];

/** A05 · Onboarding / Business source (Figma 408:235). */
export default function SourceScreen() {
  const { t } = useTranslation("onboarding");
  const [source, setSource] = useState<Source>(onboarding.source);

  return (
    <Screen
      header={<StepHeader step={2} />}
      footer={
        <Button
          label={t("common:continue")}
          arrow
          onPress={() => {
            onboarding.source = source;
            // Only a website can be read today; every other source goes to the manual details form.
            router.push(source === "website" ? "/onboarding/website" : "/onboarding/manual");
          }}
        />
      }
    >
      <Title title={t("source.title")} subtitle={t("source.subtitle")} style={{ paddingBottom: space[20] }} />
      <View accessibilityRole="radiogroup" style={{ gap: space[12] }}>
        {SOURCES.map(({ id, key, icon: I }) => (
          <OptionRow
            key={id}
            title={t(`source.options.${key}.title`)}
            description={t(`source.options.${key}.description`)}
            selected={source === id}
            onPress={() => setSource(id)}
            icon={<I size={id === "website" && source === id ? 14 : 20} color={source === id ? color.onPrimary : color.ink} strokeWidth={1.75} />}
          />
        ))}
      </View>
    </Screen>
  );
}
