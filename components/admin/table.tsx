"use client";

import { cn } from "@/lib/utils";

/**
 * A table where there's room for one, stacked cards where there isn't. It answers to its own width (a container
 * query), not the screen's, so a table in a half-width column on a wide screen becomes cards too. Cards: the first
 * column is the card's title, the rest are label / value pairs. Both forms are in the page; CSS shows one.
 * Drawn in the browser: the rows arrive once and are rendered twice here. Rendered twice on the server, the same
 * cells were sent as references from the cards into the table, and React left the page hanging on the next
 * navigation (a filter or tab click did nothing).
 * The table form needs room for its columns: 28 rem for three or fewer, 48 rem otherwise, 56 rem with `wide` (a 1280 px laptop beside the admin sidebar has about 58).
 */
export function Table({ head, rows, empty, numeric = [], wide = false }: { head: string[]; rows: React.ReactNode[][]; empty: string; numeric?: number[]; wide?: boolean }) {
  // Literal class names, so Tailwind sees them.
  const room = wide ? ["@4xl:block", "@4xl:hidden"] : head.length <= 3 ? ["@md:block", "@md:hidden"] : ["@3xl:block", "@3xl:hidden"];
  if (!rows.length) return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="@container">
      <div className={cn("hidden overflow-x-auto rounded-xl border border-border bg-card", room[0])}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              {head.map((h, i) => (
                <th key={h} scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-medium", numeric.includes(i) && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="align-top transition-colors hover:bg-muted/40">
                {r.map((c, j) => (
                  <td key={j} className={cn("px-3 py-2.5", numeric.includes(j) && "whitespace-nowrap text-right tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={cn("divide-y divide-border rounded-xl border border-border bg-card", room[1])}>
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col gap-2.5 px-4 py-3 text-sm">
            <div className="min-w-0 break-words">{r[0]}</div>
            {r.length > 1 ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @md:grid-cols-3">
                {r.slice(1).map((c, j) => (
                  <div key={j} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{head[j + 1]}</dt>
                    {/* Values left-aligned here (Money right-aligns itself for table columns). */}
                    <dd className="mt-0.5 break-words tabular-nums [&_.items-end]:items-start">{c}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
