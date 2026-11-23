"use client";

/** One total with the previous period beside it: "1,234 · +12% vs 1,100 before". */
export function Stat({ label, value, before, delta }: { label: string; value: string; before?: string; delta?: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-2xl font-medium tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {before !== undefined ? (
        <span className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {delta ? `${delta} · ` : ""}was {before}
        </span>
      ) : null}
    </div>
  );
}
