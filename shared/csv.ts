// A cell that starts a formula in Excel/Sheets (after any blanks or control characters, ASCII or full-width) gets a leading '.
const FORMULA = /^[\s\u0000-\u001f]*[=+\-@|＝＋－＠]/;

const cell = (v: unknown) => {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 CSV with a BOM (so Excel reads UTF-8) and CRLF line ends. */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
