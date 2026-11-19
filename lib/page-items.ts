/**
 * The page buttons to draw: the first and last page, the current one and its neighbours, a "gap" where pages are left
 * out. A gap that would hide a single page shows that page instead. 1..7 pages: all of them.
 */
export function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total));
  const out: (number | "gap")[] = [];
  let last = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - last === 2) out.push(last + 1);
    else if (n - last > 2) out.push("gap");
    out.push(n);
    last = n;
  }
  return out;
}
