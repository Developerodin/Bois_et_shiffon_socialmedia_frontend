"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const COLUMNS = { 2: "grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4" } as const;

/**
 * One choice from a few, as cards with a title, an optional description and an optional meta line (a price, a ratio).
 * Native radios in labels: arrow keys move, one tab stop per group. Selected: a ring and a check.
 */
export function ChoiceCards<T extends string>({ legend, name, value, onChange, options, columns = 3 }: {
  legend: string;
  name: string;
  /** null: nothing chosen yet. */
  value: T | null;
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
  options: readonly { value: T; title: string; description?: string; meta?: string }[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", COLUMNS[columns])}>
        {options.map((o) => (
          <label
            key={o.value}
            className="relative flex cursor-pointer flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 pr-9 text-sm transition-colors ring-offset-2 ring-offset-background hover:bg-muted has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="font-medium">{o.title}</span>
            {o.description ? <span className="text-xs text-muted-foreground">{o.description}</span> : null}
            {o.meta ? <span className="text-xs font-medium text-muted-foreground">{o.meta}</span> : null}
            {value === o.value ? (
              <span className="absolute right-3 top-3 inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                <Check className="size-3.5" />
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
