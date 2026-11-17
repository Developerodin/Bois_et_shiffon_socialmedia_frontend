import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { navFor } from "@/lib/nav";

const SHELL = join(process.cwd(), "app", "(shell)");
/** Pages that only redirect, so they never render a title. */
const REDIRECT_ONLY = new Set(["calendar", "chat"]);

function pages(dir: string, rel = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.isDirectory()) return pages(join(dir, d.name), rel ? `${rel}/${d.name}` : d.name);
    return d.name === "page.tsx" ? [rel] : [];
  });
}

describe("page titles", () => {
  it("gives every shell page a title", () => {
    const missing = pages(SHELL)
      .filter((p) => !REDIRECT_ONLY.has(p))
      .filter((p) => !/export const metadata|export async function generateMetadata/.test(readFileSync(join(SHELL, p, "page.tsx"), "utf8")));
    expect(missing).toEqual([]);
  });

  it("takes titles from the navigation", () => {
    expect(navFor("/settings").title).toBe("Settings");
    expect(navFor("/").title).toBe("Overview");
  });
});
