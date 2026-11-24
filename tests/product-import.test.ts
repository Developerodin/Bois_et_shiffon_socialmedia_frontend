import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personOwned, type ImportPreviewDto, type ImportResultDto } from "@/shared";
import { productsApi } from "@/components/products/api";
import {
  PreviewTable,
  duplicatesLine,
  importable,
  lockedColumns,
  mappingProblem,
  remap,
  resultSummary,
  startMapping,
} from "@/components/products/import-dialog";

const preview = (over: Partial<ImportPreviewDto> = {}): ImportPreviewDto => ({
  headers: ["Nom", "Prix", "Réf"],
  mapping: ["title", "price", "sku"],
  sample: [["Chaise", "1 299,00 €", "C-1"]],
  rowCount: 10,
  skipped: 2,
  duplicates: 1,
  problems: [{ row: 4, reason: "it has no name" }],
  needsApproval: [],
  ...over,
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(preview()), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("import dialog maps, re-maps and posts the mapping", () => {
  it("re-mapping a field moves it off the column that had it", () => {
    expect(remap(["title", "price", "sku"], 2, "title")).toEqual([null, "price", "title"]);
    expect(remap(["title", "price", "sku"], 1, null)).toEqual(["title", null, "sku"]);
  });
  it("needs a name column", () => {
    expect(mappingProblem(["title", null])).toBeNull();
    expect(mappingProblem([null, "sku"])).toMatch(/product name/);
  });
  it("counts the products the import would save", () => {
    expect(importable(preview())).toBe(7);
  });
  it("previews without a mapping first, then posts the chosen one", async () => {
    const file = new File(["Nom;Prix\nChaise;12"], "a.csv", { type: "text/csv" });
    await productsApi.previewImport("w", "b", file);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/workspaces/w/brands/b/products/import?dryRun=1");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect((init.body as FormData).has("mapping")).toBe(false);

    fetchMock.mockImplementation(async () => new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } }));
    await productsApi.importFile("w", "b", file, ["title", null]);
    const [url2, init2] = fetchMock.mock.calls[1]!;
    expect(url2).toBe("/api/v1/workspaces/w/brands/b/products/import");
    expect(init2.method).toBe("POST");
    expect(JSON.parse((init2.body as FormData).get("mapping") as string)).toEqual(["title", null]);
    // The browser sets the multipart boundary; a JSON content type would break the upload.
    expect(new Headers(init2.headers).get("content-type")).toBeNull();
  });
});

describe("vouched columns disabled without rights", () => {
  const p = preview({ needsApproval: ["price", "compareAtPrice", "inStock", "stockQuantity", "materials", "dimensions", "certifications"] });
  it("starts the matched price column at Skip and remembers why", () => {
    expect(startMapping(p)).toEqual(["title", null, "sku"]);
    expect(lockedColumns(p)).toEqual([null, "price", null]);
  });
  it("disables the column and the fields, and says why", () => {
    const html = renderToStaticMarkup(createElement(PreviewTable, { preview: p, mapping: startMapping(p), locked: lockedColumns(p), onChange: () => {} }));
    expect(html).toContain('aria-label="Import column Prix as"');
    expect(html).toMatch(/<select[^>]*aria-label="Import column Prix as"[^>]*disabled=""/);
    expect(html).toContain("Price: needs approval rights");
    expect(html).toMatch(/<option value="price" disabled="">Price \(needs approval rights\)<\/option>/);
    expect(html).not.toMatch(/<select[^>]*aria-label="Import column Nom as"[^>]*disabled=""/);
  });
  it("leaves every field open to someone who can approve", () => {
    const html = renderToStaticMarkup(createElement(PreviewTable, { preview: preview(), mapping: ["title", "price", "sku"], locked: [null, null, null], onChange: () => {} }));
    expect(html).not.toContain("needs approval rights");
    expect(html).toContain("1 299,00 €");
  });
});

describe("result summary", () => {
  const r: ImportResultDto = { created: 12, updated: 30, unchanged: 0, archived: 4, skipped: 2, duplicates: 1, problems: [] };
  it("says what changed", () => {
    expect(resultSummary(r)).toBe("12 added, 30 updated, 4 archived, 2 rows skipped.");
    expect(resultSummary({ ...r, unchanged: 5, skipped: 1 })).toBe("12 added, 30 updated, 5 unchanged, 4 archived, 1 row skipped.");
    expect(resultSummary({ ...r, skipped: 0 })).toBe("12 added, 30 updated, 4 archived.");
  });
  it("says when duplicate rows were folded", () => {
    expect(duplicatesLine(0)).toBeNull();
    expect(duplicatesLine(1)).toMatch(/^1 row had the same SKU, link or name/);
  });
});

describe("IMPORT rows editable", () => {
  it("are person-owned", () => {
    expect(personOwned("IMPORT")).toBe(true);
    expect(personOwned("SITE")).toBe(false);
  });
  it("the board edits and deletes them like rows added by hand, and labels them", () => {
    const s = fs.readFileSync(path.join(process.cwd(), "components/products/products-board.tsx"), "utf8");
    expect(s).not.toContain('=== "MANUAL"');
    expect(s).toContain("personOwned(p.source) ? (");
    expect(s).toContain("personOwned(product.source)");
    expect(s).toContain('IMPORT: "Imported"');
    expect(s).toContain("SITE: \"From your website's product pages\"");
  });
});
