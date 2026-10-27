import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import i18n from "@/i18n";

/**
 * App interface languages, each shown in its own name so people can find theirs without reading English.
 * `code` is the translation folder in src/i18n/locales; English variants fall back to "en" (US) for
 * anything they don't override (spelling, date order, wording).
 */
export type AppLanguage = { code: string; native: string; english: string; rtl?: boolean };

export const APP_LANGUAGES: AppLanguage[] = [
  { code: "en", native: "English (US)", english: "English (United States)" },
  { code: "en-GB", native: "English (UK)", english: "English (United Kingdom)" },
  { code: "en-IN", native: "English (India)", english: "English (India)" },
  { code: "en-AU", native: "English (Australia)", english: "English (Australia)" },
  { code: "en-CA", native: "English (Canada)", english: "English (Canada)" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "fr", native: "Français", english: "French" },
  { code: "de", native: "Deutsch", english: "German" },
  { code: "es", native: "Español", english: "Spanish" },
  { code: "it", native: "Italiano", english: "Italian" },
  { code: "pt", native: "Português", english: "Portuguese" },
  { code: "nl", native: "Nederlands", english: "Dutch" },
  { code: "pl", native: "Polski", english: "Polish" },
  { code: "sv", native: "Svenska", english: "Swedish" },
  { code: "da", native: "Dansk", english: "Danish" },
  { code: "nb", native: "Norsk", english: "Norwegian" },
  { code: "fi", native: "Suomi", english: "Finnish" },
  { code: "cs", native: "Čeština", english: "Czech" },
  { code: "ro", native: "Română", english: "Romanian" },
  { code: "hu", native: "Magyar", english: "Hungarian" },
  { code: "el", native: "Ελληνικά", english: "Greek" },
  { code: "uk", native: "Українська", english: "Ukrainian" },
  { code: "tr", native: "Türkçe", english: "Turkish" },
  { code: "ar", native: "العربية", english: "Arabic", rtl: true },
];

const KEY = "espanda.language";
const store = {
  get: () => (Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.getItem(KEY) ?? null) : SecureStore.getItemAsync(KEY)),
  set: (v: string) => (Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.setItem(KEY, v)) : SecureStore.setItemAsync(KEY, v)),
};

/** The phone's language when we support it (exact region first, e.g. en-GB, then the base language), else US English. */
function deviceLanguage(): string {
  const tag = (Intl.DateTimeFormat().resolvedOptions().locale ?? "en").replace("_", "-");
  const [base, region] = tag.split("-");
  const exact = `${base.toLowerCase()}-${(region ?? "").toUpperCase()}`;
  if (APP_LANGUAGES.some((l) => l.code === exact)) return exact;
  const b = base.toLowerCase().replace(/^no$/, "nb");
  return APP_LANGUAGES.some((l) => l.code === b) ? b : "en";
}

export const findLanguage = (code: string) => APP_LANGUAGES.find((l) => l.code === code) ?? APP_LANGUAGES[0];

/** Applies the saved choice (or the phone's language) at startup. */
export async function loadAppLanguage() {
  const saved = await store.get().catch(() => null);
  await i18n.changeLanguage(saved && APP_LANGUAGES.some((l) => l.code === saved) ? saved : deviceLanguage());
}

export async function setAppLanguage(code: string) {
  await i18n.changeLanguage(code);
  await store.set(code).catch(() => {}); // a failed save only means the phone's language is used next launch
}

/** The current language; re-renders when it changes. */
export function useAppLanguage(): AppLanguage {
  const [code, setCode] = useState(i18n.language);
  useEffect(() => {
    i18n.on("languageChanged", setCode);
    return () => i18n.off("languageChanged", setCode);
  }, []);
  return findLanguage(code);
}
