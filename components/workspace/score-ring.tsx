import { cn } from "@/lib/utils";

/** Small circular score (0–100) with a label, like Okara's top-bar Lighthouse rings. */
export function ScoreRing({ value, label }: { value: number | null; label: string }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const tone = value == null ? "text-muted-foreground" : value >= 90 ? "text-success" : value >= 50 ? "text-warning" : "text-destructive";
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
      <svg viewBox="0 0 18 18" className={cn("size-[18px] -rotate-90", tone)} aria-hidden="true">
        <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        {value != null && (
          <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />
        )}
      </svg>
      <span className="font-semibold tabular-nums text-foreground">{value ?? "–"}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
