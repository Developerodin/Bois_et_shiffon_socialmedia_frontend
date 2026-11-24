"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { productsApi } from "@/components/products/api";
import { ApiError, errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { cn } from "@/lib/utils";
import { IMPORT_FIELDS, type ImportField, type ImportPreviewDto, type ImportProblem, type ImportResultDto } from "@/shared";

type Mapping = (ImportField | null)[];

export const FIELD_LABEL: Record<ImportField, string> = {
  title: "Name",
  sku: "SKU",
  url: "Product link",
  imageUrl: "Image link",
  price: "Price",
  compareAtPrice: "Price before discount",
  currency: "Currency",
  category: "Category",
  description: "Description",
  inStock: "In stock (yes/no)",
  stockQuantity: "Stock quantity",
  materials: "Materials",
  dimensions: "Dimensions",
  certifications: "Certifications",
};
const MAX_BYTES = 5 * 1024 * 1024; // the server's limit; checked here so a big file isn't sent for nothing
const ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const count = (n: number) => n.toLocaleString();
const plural = (n: number, one: string) => `${count(n)} ${n === 1 ? one : `${one}s`}`;

/** Per column, the field the server matched that this person can't import (stock, prices, facts), else null. */
export const lockedColumns = (p: ImportPreviewDto): Mapping => p.mapping.map((f) => (f && p.needsApproval.includes(f) ? f : null));
/** The mapping to start from: the server's guess, with the columns this person can't import set to Skip. */
export const startMapping = (p: ImportPreviewDto): Mapping => p.mapping.map((f) => (f && p.needsApproval.includes(f) ? null : f));
/** Column `col` takes `field`; a column that had it goes to Skip, since each field fits one column. */
export const remap = (m: Mapping, col: number, field: ImportField | null): Mapping =>
  m.map((f, i) => (i === col ? field : field !== null && f === field ? null : f));
/** Why this mapping can't be imported yet, or null. */
export const mappingProblem = (m: Mapping) => (m.includes("title") ? null : "Choose the column that holds the product name.");
/** The products an import would save: the good rows, one per SKU, link or name. */
export const importable = (p: Pick<ImportPreviewDto, "rowCount" | "skipped" | "duplicates">) => Math.max(0, p.rowCount - p.skipped - p.duplicates);

/** "12 added, 30 updated, 4 archived, 2 rows skipped." */
export function resultSummary(r: ImportResultDto) {
  const parts = [`${count(r.created)} added`, `${count(r.updated)} updated`];
  if (r.unchanged) parts.push(`${count(r.unchanged)} unchanged`);
  parts.push(`${count(r.archived)} archived`);
  if (r.skipped) parts.push(`${plural(r.skipped, "row")} skipped`);
  return `${parts.join(", ")}.`;
}
export const duplicatesLine = (n: number) =>
  n ? `${n === 1 ? "1 row had" : `${count(n)} rows had`} the same SKU, link or name as another row; the last one was kept.` : null;

/** A problem the server reports; `skipped` false (or absent, from an older server): imported, but worth a look. */
type Problem = ImportProblem & { skipped?: boolean };
const PROBLEM_CAP = 50; // the server sends the first 50 problems

/** The problems as two lists, each with a heading that says when it's only the first ones. */
export function problemLists(problems: Problem[], skipped: number) {
  const capped = problems.length >= PROBLEM_CAP;
  const out = problems.filter((p) => p.skipped === true);
  const check = problems.filter((p) => p.skipped !== true);
  return [
    { heading: `Skipped rows${skipped > out.length ? ` (the first ${count(out.length)} of ${count(skipped)})` : ""}`, items: out },
    { heading: `Rows to check${capped ? ` (the first ${count(check.length)})` : ""}`, items: check },
  ].filter((l) => l.items.length > 0);
}

/** Row numbers as in the file (the header is row 1). */
function Problems({ problems, skipped }: { problems: Problem[]; skipped: number }) {
  return problemLists(problems, skipped).map((l) => (
    <div key={l.heading} className="flex flex-col gap-1.5 text-sm">
      <p>{l.heading}</p>
      <ul className="max-h-32 overflow-y-auto rounded-md border border-border px-3 py-2 text-muted-foreground">
        {l.items.map((p, i) => (
          <li key={i}>
            Row {p.row}: {p.reason}
          </li>
        ))}
      </ul>
    </div>
  ));
}

/** A clear line for a refused import: another one or a sync running (409), or too many imports (429). */
export function importError(err: unknown, fallback: string) {
  if (err instanceof ApiError && (err.status === 409 || err.status === 429)) {
    const detail = (err.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    return err.status === 409
      ? "Another import or a catalogue sync is running for this business. Try again in a minute."
      : "Too many imports right now. Try again in a while.";
  }
  return errorMessage(err, fallback);
}

/**
 * The file's first rows under one dropdown per column. A column the server matched to a field this person can't
 * import is shown as Skip, disabled, and says why; those fields are disabled in every other dropdown too.
 */
export function PreviewTable({
  preview,
  mapping,
  locked,
  onChange,
}: {
  preview: ImportPreviewDto;
  mapping: Mapping;
  locked: Mapping;
  onChange: (col: number, field: ImportField | null) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 align-top">
          <tr>
            {preview.headers.map((h, col) => {
              const lockedField = locked[col] ?? null;
              const name = h.trim() || `Column ${col + 1}`;
              return (
                <th key={col} scope="col" className="min-w-40 px-3 py-2 font-medium">
                  <label className="flex flex-col gap-1.5">
                    <span className="truncate" title={name}>{name}</span>
                    <select
                      aria-label={`Import column ${name} as`}
                      value={mapping[col] ?? ""}
                      disabled={lockedField !== null}
                      onChange={(e) => onChange(col, (e.target.value || null) as ImportField | null)}
                      className={cn(selectClass, "font-normal")}
                    >
                      <option value="">Skip</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f} value={f} disabled={preview.needsApproval.includes(f)}>
                          {FIELD_LABEL[f]}
                          {preview.needsApproval.includes(f) ? " (needs approval rights)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {lockedField ? (
                    <p className="mt-1 text-xs font-normal text-muted-foreground">{FIELD_LABEL[lockedField]}: needs approval rights</p>
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {preview.sample.map((cells, r) => (
            <tr key={r}>
              {preview.headers.map((_, col) => (
                <td key={col} className={cn("max-w-64 truncate px-3 py-2", mapping[col] ? "text-foreground" : "text-muted-foreground")}>
                  {cells[col] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Import products from a CSV or Excel file: pick it, check the columns in a preview (each dropdown change previews
 * again, so the skipped rows are what the import will skip), import, read the summary. Nothing is stored between the
 * preview and the import: the file is sent each time (5 MB at most, so a few re-previews cost little).
 */
export function ImportDialog({
  workspaceId,
  brandId,
  onClose,
  onImported,
}: {
  workspaceId: string;
  brandId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [locked, setLocked] = useState<Mapping>([]);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  // One preview upload at a time: a newer one, or closing the dialog, cancels the one on its way, and only the
  // latest request's end clears the spinner.
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);
  const cancelPreview = useCallback(() => {
    if (!inflight.current) return;
    inflight.current.abort();
    inflight.current = null;
    setPreviewing(false);
  }, []);

  const runPreview = useCallback(
    async (f: File, m: Mapping | undefined, fallback: string, done: (p: ImportPreviewDto) => void) => {
      inflight.current?.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setPreviewing(true);
      try {
        const p = await productsApi.previewImport(workspaceId, brandId, f, m, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setError(null);
        done(p);
      } catch (err) {
        if (!ctrl.signal.aborted) setError(importError(err, fallback));
      } finally {
        if (inflight.current === ctrl) {
          inflight.current = null;
          setPreviewing(false);
        }
      }
    },
    [workspaceId, brandId],
  );

  function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (f.size > MAX_BYTES) return setError("Files can be up to 5 MB.");
    // The old file's table goes, so a re-preview still waiting for it can't start and cancel this one.
    setFile(null);
    setPreview(null);
    void runPreview(f, undefined, "Couldn't read this file. Try again.", (p) => {
      setFile(f);
      setPreview(p);
      setLocked(lockedColumns(p));
      setMapping(startMapping(p));
    });
  }

  // A changed mapping previews again once the dropdowns have been still for 400 ms. Changed back to what the preview
  // shows (or to no name column): the upload on its way is for a mapping no longer chosen, so it's cancelled.
  const sent = JSON.stringify(mapping);
  const previewed = preview ? JSON.stringify(preview.mapping) : "";
  const current = sent === previewed;
  const problem = preview ? mappingProblem(mapping) : null;
  useEffect(() => {
    if (!file) return;
    if (current || problem) return cancelPreview();
    const t = setTimeout(() => void runPreview(file, JSON.parse(sent) as Mapping, "Couldn't check these columns. Try again.", setPreview), 400);
    return () => clearTimeout(t);
  }, [file, current, problem, sent, runPreview, cancelPreview]);

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await productsApi.importFile(workspaceId, brandId, file, mapping));
      onImported();
    } catch (err) {
      setError(importError(err, "Couldn't import this file. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const n = preview ? importable(preview) : 0;
  const ready = preview && current && !problem && !previewing && !busy && n > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import products from a file</DialogTitle>
          <DialogDescription>
            A CSV or Excel (.xlsx) file with one product per row and a header row, up to 5 MB. Importing the file again
            updates these products, adds new ones and archives the ones it no longer has. Products added by hand or from
            your store aren&apos;t changed.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm font-medium">{resultSummary(result)}</p>
            {duplicatesLine(result.duplicates) ? <p className="text-sm text-muted-foreground">{duplicatesLine(result.duplicates)}</p> : null}
            <Problems problems={result.problems} skipped={result.skipped} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">File</span>
              <input
                type="file"
                accept={ACCEPT}
                disabled={busy}
                onChange={(e) => void pick(e.target.files?.[0])}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground"
              />
            </label>
            {previewing && !preview ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading the file…
              </p>
            ) : null}
            {preview ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {plural(preview.rowCount, "row")} in {file?.name}.{" "}
                  {preview.rowCount > preview.sample.length ? `The first ${preview.sample.length} are shown. ` : ""}
                  Choose what each column holds, or Skip it.
                </p>
                {preview.needsApproval.length ? (
                  <p className="text-sm text-muted-foreground">
                    Prices, stock and product facts can only be imported by someone who can approve product claims, so
                    those columns are skipped.
                  </p>
                ) : null}
                <PreviewTable preview={preview} mapping={mapping} locked={locked} onChange={(col, f) => setMapping((m) => remap(m, col, f))} />
                <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
                  {previewing ? "Checking the rows with these columns…" : ""}
                </p>
                {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
                {duplicatesLine(preview.duplicates) ? <p className="text-sm text-muted-foreground">{duplicatesLine(preview.duplicates)}</p> : null}
                {preview.skipped ? <p className="text-sm">{plural(preview.skipped, "row")} will be skipped.</p> : null}
                <Problems problems={preview.problems} skipped={preview.skipped} />
              </>
            ) : null}
          </div>
        )}

        <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={() => void runImport()} disabled={!ready}>
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {busy ? "Importing…" : `Import ${plural(n, "product")}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
