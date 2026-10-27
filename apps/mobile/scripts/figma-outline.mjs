// Turns exported Figma node JSON (.figma/<page>/<screen>.json) into a compact, readable outline
// (.figma/<page>/<screen>.outline.txt): one line per node with layout, size, colours, radius, text.
// Usage (from apps/mobile): node scripts/figma-outline.mjs
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";

const OUT = ".figma";
const hex = (c, o = 1) => {
  const h = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  const a = (c.a ?? 1) * o;
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${a < 0.999 ? `@${a.toFixed(2)}` : ""}`.toUpperCase();
};
const paint = (p) => {
  if (p.visible === false) return null;
  if (p.type === "SOLID") return hex(p.color, p.opacity ?? 1);
  if (p.type === "IMAGE") return `image(${p.imageRef ?? "?"},${p.scaleMode})`;
  if (p.type.startsWith("GRADIENT")) return `${p.type.replace("GRADIENT_", "").toLowerCase()}-gradient(${p.gradientStops.map((s) => `${hex(s.color)} ${Math.round(s.position * 100)}%`).join(", ")})`;
  return p.type.toLowerCase();
};

function line(n, depth, parent) {
  const b = n.absoluteBoundingBox;
  const p = parent?.absoluteBoundingBox;
  const parts = [`${n.type.toLowerCase()} "${n.name}"`];
  if (b) parts.push(`${Math.round(b.width)}×${Math.round(b.height)}${p && parent.layoutMode === "NONE" || p && n.layoutPositioning === "ABSOLUTE" ? ` @${Math.round(b.x - p.x)},${Math.round(b.y - p.y)}` : ""}`);
  if (n.layoutMode && n.layoutMode !== "NONE") {
    const pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].map((v) => v ?? 0);
    parts.push(`${n.layoutMode === "HORIZONTAL" ? "row" : n.layoutMode === "VERTICAL" ? "col" : "grid"} gap${n.itemSpacing ?? 0} pad${pad.join("/")} main:${(n.primaryAxisAlignItems ?? "MIN").toLowerCase()} cross:${(n.counterAxisAlignItems ?? "MIN").toLowerCase()}${n.layoutWrap === "WRAP" ? " wrap" : ""}`);
  }
  if (n.layoutGrow === 1) parts.push("grow");
  if (n.layoutSizingHorizontal === "FILL" || n.layoutAlign === "STRETCH") parts.push("fill-w");
  const fills = (n.type === "TEXT" ? [] : n.fills ?? []).map(paint).filter(Boolean);
  if (fills.length) parts.push(`bg ${fills.join(" + ")}`);
  const strokes = (n.strokes ?? []).map(paint).filter(Boolean);
  if (strokes.length && n.strokeWeight) parts.push(`border ${n.strokeWeight}${n.individualStrokeWeights ? `(t${n.individualStrokeWeights.top} r${n.individualStrokeWeights.right} b${n.individualStrokeWeights.bottom} l${n.individualStrokeWeights.left})` : ""} ${strokes.join(",")}`);
  if (n.cornerRadius) parts.push(`r${n.cornerRadius}`);
  else if (n.rectangleCornerRadii) parts.push(`r${n.rectangleCornerRadii.join("/")}`);
  for (const e of n.effects ?? []) {
    if (e.visible === false) continue;
    if (e.type === "DROP_SHADOW") parts.push(`shadow ${e.offset.x},${e.offset.y} blur${e.radius} ${hex(e.color)}`);
    else parts.push(`${e.type.toLowerCase()} ${e.radius}`);
  }
  if (n.opacity !== undefined && n.opacity < 1) parts.push(`opacity ${n.opacity.toFixed(2)}`);
  if (n.rotation) parts.push(`rot ${Math.round((n.rotation * 180) / Math.PI)}°`);
  if (n.type === "TEXT") {
    const s = n.style ?? {};
    const color = (n.fills ?? []).map(paint).filter(Boolean)[0];
    parts.push(`text ${s.fontFamily} ${s.fontSize}/${Math.round(s.lineHeightPx ?? 0)} w${s.fontWeight}${s.letterSpacing ? ` ls${s.letterSpacing.toFixed(2)}` : ""}${s.textAlignHorizontal && s.textAlignHorizontal !== "LEFT" ? ` ${s.textAlignHorizontal.toLowerCase()}` : ""} ${color ?? ""} «${n.characters.replace(/\s+/g, " ").trim()}»`);
  }
  if (n.type === "INSTANCE" && n.componentProperties) {
    const props = Object.entries(n.componentProperties).map(([k, v]) => `${k.split("#")[0]}=${v.value}`).join(" ");
    if (props) parts.push(`props{${props}}`);
  }
  return `${"  ".repeat(depth)}${parts.join(" · ")}`;
}

function outline(n, depth = 0, parent = null, lines = []) {
  if (n.visible === false) return lines;
  lines.push(line(n, depth, parent));
  // Icon internals (vector paths) add nothing for layout: stop at "Icon" frames.
  if (/^icon\b/i.test(n.name) || n.type === "VECTOR" || n.type === "BOOLEAN_OPERATION") return lines;
  for (const c of n.children ?? []) outline(c, depth + 1, n, lines);
  return lines;
}

let count = 0;
for (const dir of readdirSync(OUT)) {
  if (!statSync(`${OUT}/${dir}`).isDirectory() || !/^\d\d-/.test(dir)) continue;
  for (const f of readdirSync(`${OUT}/${dir}`).filter((f) => f.endsWith(".json"))) {
    const node = JSON.parse(readFileSync(`${OUT}/${dir}/${f}`, "utf8"));
    writeFileSync(`${OUT}/${dir}/${f.replace(/\.json$/, ".outline.txt")}`, outline(node).join("\n") + "\n");
    count++;
  }
}
console.log(`outlines: ${count}`);
