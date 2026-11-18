"use client";

/** Pills for 2–4 choices (Product | Fashion, a filter): native radios in labels, so arrow keys move and the group is one tab stop. */
export function SegmentedRadios<T extends string>({ label, name, value, onChange, options }: {
  /** The group's name for screen readers (the pills say the rest). */
  label: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  /** `count` shows after the label: "Uploads (3)". */
  options: readonly { value: T; label: string; count?: number }[];
}) {
  return (
    <fieldset className="flex gap-1 self-start rounded-full border border-border bg-card p-1">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
          {o.label}
          {o.count === undefined ? null : ` (${o.count})`}
        </label>
      ))}
    </fieldset>
  );
}
