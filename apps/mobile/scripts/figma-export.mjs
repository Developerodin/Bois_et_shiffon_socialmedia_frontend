// One-time export of the Espanda app pages from Figma's REST API (no MCP call limits).
// Usage (from apps/mobile): node scripts/figma-export.mjs
// Needs FIGMA_TOKEN in .env.local (file_content:read). Writes to .figma/ (git-ignored):
//   .figma/<page>/<screen>.json   full node tree (layout, fills, text, effects)
//   .figma/<page>/<screen>.png    2x render, the visual target
//   .figma/images/<imageRef>.png  photos used as image fills
//   .figma/icons/<nodeId>.svg     every node named "Icon…" as SVG
//   .figma/index.json             pages → screens → files
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const FILE = "dGILR13Xa3SLUnjGAtHn1C";
const PAGES = { "360:2": "00-design-system", "360:3": "01-onboarding", "360:4": "02-reels", "360:5": "03-posts", "360:6": "04-photoshoot", "360:7": "05-business", "360:8": "06-plans", "360:9": "07-recovery", "462:2": "98-archived-variants" };
const OUT = ".figma";

const token = (readFileSync(".env.local", "utf8").match(/^FIGMA_TOKEN=(.+)$/m)?.[1] ?? "").trim();
if (!token) throw new Error("FIGMA_TOKEN missing in .env.local");

async function api(path, attempt = 0) {
  const res = await fetch(`https://api.figma.com/v1/${path}`, { headers: { "X-Figma-Token": token } });
  if (res.status === 429 && attempt < 6) {
    const wait = Number(res.headers.get("retry-after") ?? 30) * 1000;
    // Figma can ask for very long waits on Starter/View seats: say so instead of hanging silently.
    if (wait > 120_000) throw new Error(`Figma rate limit: asked to wait ${Math.round(wait / 60000)} min (${path.split("?")[0]})`);
    console.log(`rate limited, waiting ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
    return api(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${path.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function download(url, file) {
  if (existsSync(file)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} downloading ${file}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const slug = (s) => s.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 60);

function walk(node, fn) {
  fn(node);
  for (const c of node.children ?? []) walk(c, fn);
}

mkdirSync(`${OUT}/images`, { recursive: true });
mkdirSync(`${OUT}/icons`, { recursive: true });

// Pages → top-level frames (screens).
const doc = await api(`files/${FILE}?depth=2`);
const index = {};
const imageRefs = new Set();
const iconIds = new Set();

for (const page of doc.document.children) {
  const dir = PAGES[page.id];
  if (!dir) continue;
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
  const screens = (page.children ?? []).filter((n) => n.type === "FRAME" || n.type === "COMPONENT" || n.type === "COMPONENT_SET");
  index[dir] = [];
  // Resume: screens with both JSON and PNG on disk are not fetched again.
  for (const s of screens) {
    const file = `${dir}/${slug(s.name)}`;
    if (existsSync(`${OUT}/${file}.json`) && existsSync(`${OUT}/${file}.png`)) {
      index[dir].push({ id: s.id, name: s.name, file });
      walk(JSON.parse(readFileSync(`${OUT}/${file}.json`, "utf8")), (n) => {
        for (const f of n.fills ?? []) if (f.type === "IMAGE" && f.imageRef) imageRefs.add(f.imageRef);
        if (/^icon/i.test(n.name) || /^ant-design:|^lucide:|^mdi:/i.test(n.name)) iconIds.add(n.id);
      });
    }
  }
  const todo = screens.filter((s) => !index[dir].some((e) => e.id === s.id));
  for (const ids of chunk(todo.map((s) => s.id), 10)) {
    console.log(`${dir}: fetching ${ids.length} screens`);
    const { nodes } = await api(`files/${FILE}/nodes?ids=${encodeURIComponent(ids.join(","))}`);
    for (const [id, { document: node }] of Object.entries(nodes)) {
      const name = `${slug(node.name)}`;
      writeFileSync(`${OUT}/${dir}/${name}.json`, JSON.stringify(node, null, 1));
      index[dir].push({ id, name: node.name, file: `${dir}/${name}` });
      walk(node, (n) => {
        for (const f of n.fills ?? []) if (f.type === "IMAGE" && f.imageRef) imageRefs.add(f.imageRef);
        if (/^icon\b/i.test(n.name) || /^ant-design:|^lucide:|^mdi:/i.test(n.name)) iconIds.add(n.id);
      });
    }
    // 2x renders for these screens.
    const { images } = await api(`images/${FILE}?ids=${encodeURIComponent(ids.join(","))}&format=png&scale=2`);
    for (const [id, url] of Object.entries(images)) {
      const entry = index[dir].find((e) => e.id === id);
      if (url && entry) await download(url, `${OUT}/${entry.file}.png`);
    }
  }
  console.log(`${dir}: ${index[dir].length} screens`);
}

// Photos used as image fills.
const { meta } = await api(`files/${FILE}/images`);
let photos = 0;
for (const ref of imageRefs) {
  const url = meta.images[ref];
  if (url) {
    await download(url, `${OUT}/images/${ref}.png`);
    photos++;
  }
}
console.log(`photos: ${photos}`);

// Icons as SVG (100 ids per render call).
let svgs = 0;
for (const ids of chunk([...iconIds], 100)) {
  const { images } = await api(`images/${FILE}?ids=${encodeURIComponent(ids.join(","))}&format=svg`);
  for (const [id, url] of Object.entries(images)) {
    if (!url) continue;
    await download(url, `${OUT}/icons/${id.replace(/[:;]/g, "_")}.svg`);
    svgs++;
  }
}
console.log(`icons: ${svgs}`);

writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
console.log("done →", OUT);
