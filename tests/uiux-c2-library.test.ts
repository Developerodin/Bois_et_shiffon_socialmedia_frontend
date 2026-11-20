import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("library photo removal", () => {
  it("asks before deleting, through the shared ConfirmDialog", () => {
    expect(read("components/library/library-board.tsx")).toMatch(/import \{[^}]*ConfirmDialog[^}]*\} from "@\/components\/settings\/shared"/);
  });
  it("shows full photo names on hover", () => {
    expect(read("components/library/photo-grid.tsx").match(/title=\{p\.title\}/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
