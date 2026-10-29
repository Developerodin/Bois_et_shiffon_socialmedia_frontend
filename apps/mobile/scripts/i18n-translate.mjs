// Machine-translates src/i18n/locales/en/*.json into every app language with OpenAI.
// Only keys missing from a target file are sent, so re-running after adding strings is cheap.
// Output is a first draft: have a native speaker review before release (see src/i18n/README.md).
// Usage (from apps/mobile): node scripts/i18n-translate.mjs --model <openai model id> [lang …]
//   key read from ../web/.env OPENAI_API_KEY. No model is built in: pass one (e.g. the medium tier's, Settings → AI models).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const LANGS = {
  "en-GB": "British English (UK spelling: colour, catalogue, organise; DD/MM dates; British wording)",
  "en-IN": "Indian English (UK-style spelling, Indian conventions; DD/MM dates)",
  "en-AU": "Australian English (UK-style spelling, Australian wording; DD/MM dates)",
  "en-CA": "Canadian English (Canadian spelling: colour, centre, but -ize; Canadian wording)",
  hi: "Hindi (Devanagari script)", fr: "French", de: "German", es: "Spanish", it: "Italian", pt: "Portuguese (European)",
  nl: "Dutch", pl: "Polish", sv: "Swedish", da: "Danish", nb: "Norwegian Bokmål", fi: "Finnish", cs: "Czech",
  ro: "Romanian", hu: "Hungarian", el: "Greek", uk: "Ukrainian", tr: "Turkish", ar: "Arabic",
};
const modelAt = process.argv.indexOf("--model");
const MODEL = modelAt > -1 ? process.argv[modelAt + 1] : undefined;
if (!MODEL) throw new Error("Pass the model: node scripts/i18n-translate.mjs --model <openai model id> [lang …]");
if (modelAt > -1) process.argv.splice(modelAt, 2); // the rest are languages
const ROOT = "src/i18n/locales";

const key = (readFileSync("../web/.env", "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("OPENAI_API_KEY missing in apps/web/.env");

const flatten = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flatten(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const unflatten = (pairs) => {
  const out = {};
  for (const [path, v] of pairs) {
    const parts = path.split(".");
    let o = out;
    for (const p of parts.slice(0, -1)) o = o[p] ??= {};
    o[parts.at(-1)] = v;
  }
  return out;
};

async function translate(lang, entries) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `Translate the UI strings of a mobile marketing app for small retail businesses into ${LANGS[lang]}. ` +
            `Return a JSON object with exactly the same keys. Rules: keep {{placeholders}} and <tag>…</tag> markup exactly; ` +
            `do not translate brand or product names (Espanda, Bois & Chiffons, Instagram, Facebook, Google, WhatsApp, Pinterest, Shopify, Acacia Bunting, Bunting); ` +
            `keep quoted French marketing copy (text inside « ») unchanged; use the short, natural wording people expect in apps (button labels stay short); ` +
            `use the informal-but-professional register common in consumer apps for that language.` +
            (lang.startsWith("en-") ? ` This is a regional English variant of US English source text: change only spelling, date/number conventions and words that differ in that region; keep the source's capitalisation and sentence case exactly.` : ""),
        },
        { role: "user", content: JSON.stringify(Object.fromEntries(entries)) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${lang}: OpenAI ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = JSON.parse((await res.json()).choices[0].message.content);
  return entries.map(([k, v]) => [k, typeof json[k] === "string" && json[k].trim() ? json[k] : v]);
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LANGS);
const namespaces = readdirSync(`${ROOT}/en`).filter((f) => f.endsWith(".json"));
for (const lang of targets) {
  mkdirSync(`${ROOT}/${lang}`, { recursive: true });
  for (const file of namespaces) {
    const source = flatten(JSON.parse(readFileSync(`${ROOT}/en/${file}`, "utf8")));
    const path = `${ROOT}/${lang}/${file}`;
    const existing = existsSync(path) ? new Map(flatten(JSON.parse(readFileSync(path, "utf8")))) : new Map();
    const missing = source.filter(([k]) => !existing.has(k));
    if (!missing.length) continue;
    // 120 strings per request keeps responses well inside the output limit.
    for (let i = 0; i < missing.length; i += 120) {
      for (const [k, v] of await translate(lang, missing.slice(i, i + 120))) existing.set(k, v);
    }
    // Keep the source's key order; drop keys that no longer exist in English.
    const ordered = source.map(([k]) => [k, existing.get(k)]);
    writeFileSync(path, JSON.stringify(unflatten(ordered), null, 2) + "\n");
    console.log(`${lang}/${file}: +${missing.length}`);
  }
}
