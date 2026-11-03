import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

describe("light theme only", () => {
  it("has no hsl(var(...)) colour wrappers under app/ or components/", () => {
    const hits = ["app", "components"]
      .flatMap((d) => walk(path.join(root, d)))
      .filter((f) => /\.(tsx?|css)$/.test(f))
      .filter((f) => fs.readFileSync(f, "utf8").includes("hsl(var("));
    expect(hits).toEqual([]);
  });

  it("globals.css has no dark scheme", () => {
    const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).not.toContain("color-scheme: dark");
  });
});
