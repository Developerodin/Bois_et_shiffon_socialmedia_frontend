# App translations

Every visible string lives in `locales/<language>/<section>.json`. English (`en`, US spelling) is the source;
the app falls back `en-GB → en` and `<any> → en`, so a missing key shows English, never a raw key.

Sections: `common` (shared header, tabs, sign-in parts, language screen), `onboarding`, `reels`, `posts`,
`photoshoot`, `marketing`, `business`, `plans`, `recovery`.

## Adding or changing text
1. Edit the English file only, e.g. `locales/en/posts.json`, and use the key in the screen:
   `const { t } = useTranslation("posts"); t("today.title")`.
2. Fill the other languages: `node scripts/i18n-translate.mjs` (only missing keys are sent to OpenAI; pass
   language codes to limit it, e.g. `node scripts/i18n-translate.mjs fr de`). Changing an existing English
   string? Delete that key from the other languages first so it gets re-translated.
3. `node scripts/i18n-index.mjs` after adding a language or a new section file.

## Adding a language
Add it to `APP_LANGUAGES` in `src/ui/language/languages.ts` (shown in its own name) and to `LANGS` in
`scripts/i18n-translate.mjs`, run the translator for it, then `node scripts/i18n-index.mjs`.

## Status: machine translated, needs native review
All non-English files are first drafts from the translator (OpenAI: gpt-4o made the current files; the script now takes the model with --model). Before a store release in a
market, have a native speaker review that language's files — especially button lengths (German runs ~30%
longer), formality, and plurals.

## Not done yet
- **Arabic right-to-left layout.** Arabic text is translated, but screens don't mirror yet. Needs
  `I18nManager.forceRTL` plus an app reload on switch (requires `expo-updates`), and a pass over
  row layouts/icons that point left or right.
- **Server messages.** Errors from the API (e.g. "That code is wrong or has expired.") are still English.
- **Sign-in code email** is English.
