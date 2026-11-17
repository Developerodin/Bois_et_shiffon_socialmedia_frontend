import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TONE_CLASS, toneOf, type Tone } from "@/lib/status";

const root = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

describe("toneOf", () => {
  it("maps workflow statuses to tones", () => {
    expect(toneOf("PUBLISHED")).toBe("good");
    expect(toneOf("PENDING_VERIFY")).toBe("warn");
    expect(toneOf("FAILED")).toBe("bad");
    expect(toneOf("RUNNING")).toBe("info");
    expect(toneOf("QUEUED")).toBe("warn");
  });
  it("is muted for anything else", () => {
    expect(toneOf("REVIEWED")).toBe("muted");
    expect(toneOf(null)).toBe("muted");
    expect(toneOf(undefined)).toBe("muted");
    expect(toneOf("nonsense")).toBe("muted");
  });
});

describe("tone contrast", () => {
  const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const vars: Record<string, string> = {};
  for (const m of rootBlock.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\b/g)) vars[m[1]] = m[2];

  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (c: number[]) => {
    const [r, g, b] = c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: number[], alpha: number, bg: number[]) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

  for (const tone of Object.keys(TONE_CLASS) as Tone[]) {
    for (const surface of ["card", "background", "accent", "muted"]) {
      it(`${tone} text is at least 4.5:1 over ${surface}`, () => {
        const cls = TONE_CLASS[tone];
        const bg = /\bbg-([a-z-]+)(?:\/(\d+))?/.exec(cls)!;
        const text = /\btext-([a-z-]+)/.exec(cls)!;
        expect(vars[bg[1]], `--${bg[1]}`).toBeDefined();
        expect(vars[text[1]], `--${text[1]}`).toBeDefined();
        const tint = over(rgb(vars[bg[1]]), bg[2] ? Number(bg[2]) / 100 : 1, rgb(vars[surface]));
        expect(ratio(rgb(vars[text[1]]), tint)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("one badge", () => {
  it("leaves no old pill implementation under components/ or app/", () => {
    const hits = ["app", "components"]
      .flatMap((d) => walk(path.join(root, d)))
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /StatusPill|<Pill|@\/components\/ui\/badge/.test(fs.readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
