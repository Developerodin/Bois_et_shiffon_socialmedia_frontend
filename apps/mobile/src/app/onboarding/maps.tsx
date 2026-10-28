import { router } from "expo-router";
import { MapPin, Search } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { searchPlaces, type PlaceMatch } from "@/api/endpoints";
import i18n from "@/i18n";
import { Button } from "@/ui/button";
import { OptionRow } from "@/ui/choice";
import { Field } from "@/ui/field";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { onboarding } from "@/ui/onboarding/state";
import { color, space, type } from "@/theme/tokens";

/**
 * Onboarding · Find your business on Google Maps (after A05 "Google Maps"; no Figma frame, built from the A05/A07
 * kit). The owner searches name + city and picks their listing; the server then reads its details by id. Picking is
 * the owner's word that it's theirs: nothing here proves ownership (that would need Google Business Profile sign-in).
 */
export default function Maps() {
  const { t } = useTranslation("onboarding");
  const [query, setQuery] = useState(onboarding.place?.name ?? "");
  const [results, setResults] = useState<PlaceMatch[] | null>(null);
  const [picked, setPicked] = useState<string | null>(onboarding.place?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function search() {
    if (query.trim().length < 2 || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const { places } = await searchPlaces(query.trim(), i18n.language);
      setResults(places);
      setPicked(places.length === 1 ? places[0].id : null);
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : t("maps.errors.failed"));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    const place = results?.find((p) => p.id === picked);
    if (!place) return;
    onboarding.place = { id: place.id, name: place.name, address: place.address };
    router.push({ pathname: "/onboarding/learning", params: { name: place.name, place: "1" } });
  }

  const describe = () => router.push("/onboarding/manual");

  return (
    <Screen
      header={<StepHeader step={2} />}
      footer={
        <>
          <Button label={t("common:continue")} arrow disabled={!picked || !results?.some((p) => p.id === picked)} onPress={next} />
          <Button label={t("maps.notListed")} variant="ghost" height={48} onPress={describe} />
        </>
      }
    >
      <Title title={t("maps.title")} subtitle={t("maps.subtitle")} style={{ paddingBottom: 0 }} />
      <View style={{ paddingTop: space[20], gap: space[12] }}>
        <Field
          placeholder={t("maps.placeholder")}
          value={query}
          onChangeText={setQuery}
          height={48}
          maxLength={200}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={() => void search()}
          accessibilityLabel={t("maps.placeholder")}
          leading={<Search size={16} color={color.disabledInk} strokeWidth={1.75} />}
        />
        <Button label={t("maps.search")} variant="outline" height={48} loading={busy} disabled={query.trim().length < 2} onPress={() => void search()} />
        {failed ? (
          <Text accessibilityRole="alert" style={[type.meta, { color: color.error }]}>
            {failed}
          </Text>
        ) : null}
      </View>

      {busy && !results ? <ActivityIndicator color={color.inkSecondary} style={{ paddingTop: space[24] }} /> : null}
      {results ? (
        <View style={{ paddingTop: space[24], gap: space[12] }}>
          <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{results.length ? t("maps.isThisYou") : t("maps.noResults")}</Text>
          <View accessibilityRole="radiogroup" style={{ gap: space[12] }}>
            {results.map((p) => (
              <OptionRow
                key={p.id}
                title={p.name}
                description={[p.address, p.type, p.rating !== null ? t("maps.rating", { rating: p.rating.toFixed(1), count: p.ratingCount ?? 0 }) : null]
                  .filter(Boolean)
                  .join(" · ")}
                selected={picked === p.id}
                onPress={() => setPicked(p.id)}
                icon={<MapPin size={20} color={picked === p.id ? color.onPrimary : color.ink} strokeWidth={1.75} />}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
