import { cpSync, mkdtempSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashTree } from "../scripts/check-shared.mjs";

describe("shared contract hash", () => {
  it("matches the .hash stamped by the server", () => {
    expect(hashTree("shared")).toBe(readFileSync("shared/.hash", "utf8").trim());
  });

  it("changes when a file is edited", () => {
    const tmp = mkdtempSync(join(tmpdir(), "shared-"));
    cpSync("shared", tmp, { recursive: true });
    appendFileSync(join(tmp, "index.ts"), " ");
    expect(hashTree(tmp)).not.toBe(readFileSync("shared/.hash", "utf8").trim());
  });
});

describe("line endings", () => {
  it("hash the same with CRLF as with LF", () => {
    const lf = mkdtempSync(join(tmpdir(), "lf-"));
    const crlf = mkdtempSync(join(tmpdir(), "crlf-"));
    writeFileSync(join(lf, "a.ts"), "one\ntwo\n");
    writeFileSync(join(crlf, "a.ts"), "one\r\ntwo\r\n");
    expect(hashTree(crlf)).toBe(hashTree(lf));
  });
});
