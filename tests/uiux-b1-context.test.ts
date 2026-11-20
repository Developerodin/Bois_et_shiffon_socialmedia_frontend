import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("brand context copy and review-on-open", () => {
  const pane = read("components/context/doc-pane.tsx");
  it("opening a document does not confirm it", () => {
    // Confirming happens only from the Mark reviewed click handler, never from an effect.
    const calls = [...pane.matchAll(/onConfirm\(/g)].map((m) => pane.slice(Math.max(0, m.index! - 40), m.index!));
    expect(calls.filter((c) => !/onClick=\{\(\) => void $|async function $/.test(c))).toEqual([]);
    expect(pane).not.toContain("does not change what agents use until you confirm it");
    expect(pane).toContain("Agents use it from their next run.");
  });
  it("context board no longer passes autoReview", () => {
    expect(read("components/context/context-board.tsx")).not.toContain("autoReview");
  });
  it("copy says agents read the latest version", () => {
    const page = read("app/(shell)/context/page.tsx");
    expect(page).not.toContain("works from what you confirmed");
    expect(page).toContain("agents work from the latest version");
    expect(read("components/welcome/welcome-flow.tsx")).toContain("Agents use them straight away.");
  });
  it("page EmptyStates are the page h1", () => {
    expect(read("app/(shell)/context/page.tsx").match(/headingLevel="h1"/g)).toHaveLength(2);
    expect(read("app/(shell)/settings/page.tsx")).toContain('headingLevel="h1"');
  });
});
