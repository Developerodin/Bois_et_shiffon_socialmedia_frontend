import { router } from "expo-router";
import { Check, Search } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { BizScreen, BrandHeader, SettingsCard, strong14 } from "@/ui/business/kit";
import { Field } from "@/ui/field";
import { APP_LANGUAGES, setAppLanguage, useAppLanguage } from "@/ui/language/languages";
import { ICON } from "@/ui/reels/kit";

/** App language picker, opened from Account settings → App interface language. */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const current = useAppLanguage();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? APP_LANGUAGES.filter((l) => `${l.native} ${l.english} ${l.code}`.toLowerCase().includes(q)) : APP_LANGUAGES;

  return (
    <BizScreen top={space[16]} header={<BrandHeader title={t("language.title")} />}>
      <Field
        placeholder={t("language.search")}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        height={48}
        leading={<Search size={18} color={color.inkMuted} strokeWidth={ICON.strokeWidth} />}
      />
      <Text style={[type.meta, { paddingTop: space[12], paddingBottom: space[8] }]}>
        {t("language.explainer")}
      </Text>
      <SettingsCard style={styles.list}>
        <FlatList
          data={shown}
          keyExtractor={(l) => l.code}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.rule} />}
          ListEmptyComponent={<Text style={[type.meta, { padding: space[16] }]}>{t("language.noMatch", { query })}</Text>}
          renderItem={({ item }) => {
            const on = item.code === current.code;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${item.native}, ${item.english}`}
                onPress={() => void setAppLanguage(item.code).then(() => router.canGoBack() && router.back())}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.canvasAlt }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={strong14}>{item.native}</Text>
                  {item.native !== item.english ? <Text style={type.meta}>{item.english}</Text> : null}
                </View>
                {on ? (
                  <View style={styles.tick}>
                    <Check size={14} color={color.onPrimary} strokeWidth={2.5} />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      </SettingsCard>
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 56, paddingHorizontal: space[16], paddingVertical: space[8] },
  rule: { height: 1, backgroundColor: color.divider, marginLeft: space[16] },
  tick: { width: 22, height: 22, borderRadius: radius.round, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
});
