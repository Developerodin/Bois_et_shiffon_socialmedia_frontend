import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/mobile";
import countries, { type LocaleData } from "i18n-iso-countries";
import { Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Field } from "@/ui/field";
import { color, radius, space, type } from "@/theme/tokens";

/** "IN" → 🇮🇳 (two regional-indicator letters). */
export const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));

// Hermes has no Intl.DisplayNames, so names come from i18n-iso-countries, one file per app language
// (static requires: Metro can't bundle a computed path). en-GB etc. use "en".
const NAME_FILES: Record<string, () => LocaleData> = {
  ar: () => require("i18n-iso-countries/langs/ar.json"), cs: () => require("i18n-iso-countries/langs/cs.json"),
  da: () => require("i18n-iso-countries/langs/da.json"), de: () => require("i18n-iso-countries/langs/de.json"),
  el: () => require("i18n-iso-countries/langs/el.json"), en: () => require("i18n-iso-countries/langs/en.json"),
  es: () => require("i18n-iso-countries/langs/es.json"), fi: () => require("i18n-iso-countries/langs/fi.json"),
  fr: () => require("i18n-iso-countries/langs/fr.json"), hi: () => require("i18n-iso-countries/langs/hi.json"),
  hu: () => require("i18n-iso-countries/langs/hu.json"), it: () => require("i18n-iso-countries/langs/it.json"),
  nb: () => require("i18n-iso-countries/langs/nb.json"), nl: () => require("i18n-iso-countries/langs/nl.json"),
  pl: () => require("i18n-iso-countries/langs/pl.json"), pt: () => require("i18n-iso-countries/langs/pt.json"),
  ro: () => require("i18n-iso-countries/langs/ro.json"), sv: () => require("i18n-iso-countries/langs/sv.json"),
  tr: () => require("i18n-iso-countries/langs/tr.json"), uk: () => require("i18n-iso-countries/langs/uk.json"),
};

/** Country names in the app's language; a few phone-only regions (AC, TA, XK…) fall back to English, then the code. */
function countryNamer(language: string) {
  const lang = NAME_FILES[language.split("-")[0]] ? language.split("-")[0] : "en";
  for (const l of new Set([lang, "en"])) countries.registerLocale(NAME_FILES[l]());
  return (code: string) => countries.getName(code, lang, { select: SHORT_NAME.has(code) ? "alias" : "official" }) ?? countries.getName(code, "en") ?? PHONE_ONLY[code] ?? code;
}
// Dialling regions libphonenumber knows that aren't ISO countries.
const PHONE_ONLY: Record<string, string> = { AC: "Ascension Island", TA: "Tristan da Cunha", XK: "Kosovo" };
// Everyday names over the long official ones ("Taiwan" not "Taiwan, Province of China", "Russia", …).
const SHORT_NAME = new Set(["TW", "US", "RU", "IR"]);

/** The phone's region (en-IN → IN), so most people never open the picker. */
export function deviceCountry(): CountryCode {
  const region = Intl.DateTimeFormat().resolvedOptions().locale?.split(/[-_]/)[1]?.toUpperCase();
  return getCountries().includes(region as CountryCode) ? (region as CountryCode) : "IN";
}

export function CountryPicker({ visible, value, onPick, onClose }: { visible: boolean; value: CountryCode; onPick: (c: CountryCode) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation("onboarding");
  const [query, setQuery] = useState("");
  const countries = useMemo(() => {
    const name = countryNamer(i18n.language);
    return getCountries()
      .map((code) => ({ code, name: name(code), dial: `+${getCountryCallingCode(code)}` }))
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  }, [i18n.language]);
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  const shown = q ? countries.filter((c) => `${c.name} ${c.code} ${c.dial.slice(1)}`.toLowerCase().includes(q)) : countries;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onDismiss={() => setQuery("")}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={[type.pageTitle, { flex: 1 }]}>{t("signIn.chooseCountry")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common:close")} onPress={onClose} hitSlop={12} style={styles.close}>
            <X size={22} color={color.ink} strokeWidth={1.75} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: space[20], paddingBottom: space[12] }}>
          <Field
            placeholder={t("signIn.searchCountry")}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            height={48}
            leading={<Search size={18} color={color.inkMuted} strokeWidth={1.75} />}
          />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(c) => c.code}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ItemSeparatorComponent={() => <View style={styles.rule} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: item.code === value }}
              accessibilityLabel={`${item.name} ${item.dial}`}
              onPress={() => onPick(item.code)}
              style={({ pressed }) => [styles.row, (pressed || item.code === value) && { backgroundColor: color.selection }]}
            >
              <Text style={styles.flag}>{flag(item.code)}</Text>
              <Text style={[type.label, { flex: 1 }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={type.meta}>{item.dial}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[20], paddingVertical: space[16] },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.round },
  row: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 52, paddingHorizontal: space[20] },
  flag: { fontSize: 22 },
  rule: { height: 1, backgroundColor: color.divider, marginLeft: space[20] },
});
