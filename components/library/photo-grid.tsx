"use client";

import { Check, Images, Loader2, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { LibraryPhoto } from "@/shared";

export type Source = "website" | "uploads";

/** Website / Uploads pills: native radios in labels, so arrow keys move between them. */
export function SourceSwitch({ name, value, counts, onChange }: { name: string; value: Source; counts: Record<Source, number>; onChange: (s: Source) => void }) {
  const pill = (s: Source, label: string) => (
    <label className="cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
      <input type="radio" name={name} value={s} checked={value === s} onChange={() => onChange(s)} className="peer sr-only" />
      {label} ({counts[s]})
    </label>
  );
  return (
    <fieldset className="flex gap-1 self-start rounded-full border border-border bg-card p-1">
      <legend className="sr-only">Source</legend>
      {pill("website", "Website")}
      {pill("uploads", "Uploads")}
    </fieldset>
  );
}

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4";

type Props = { photos: LibraryPhoto[]; label: string; empty: { title: string; body: string } } & (
  | { mode: "browse"; onRemove?: (p: LibraryPhoto) => void; busyKey?: string | null }
  | { mode: "pick"; name: string; selected: string | null; onSelect: (key: string) => void }
);

/** The library's photos as 4:5 tiles: to look at (and remove uploads), or to choose one with radios. */
export function PhotoGrid(props: Props) {
  const { photos, label, empty } = props;
  if (photos.length === 0) return <EmptyState icon={Images} title={empty.title} description={empty.body} />;

  if (props.mode === "pick") {
    const { name, selected, onSelect } = props;
    return (
      <fieldset>
        <legend className="sr-only">{label}</legend>
        <div className={GRID}>
          {photos.map((p) => (
            <label
              key={p.key}
              className="cursor-pointer rounded-xl ring-offset-2 ring-offset-background has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input type="radio" name={name} value={p.key} checked={selected === p.key} onChange={() => onSelect(p.key)} className="peer sr-only" />
              <span className="relative block aspect-[4/5]">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed */}
                <img src={p.url} alt="" loading="lazy" className="size-full rounded-xl bg-muted object-cover" />
                {selected === p.key ? (
                  <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                    <Check className="size-4" />
                  </span>
                ) : null}
              </span>
              <span className="block truncate px-1 py-2 text-center text-xs">{p.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const { onRemove, busyKey = null } = props;
  return (
    <ul aria-label={label} className={GRID}>
      {photos.map((p) => (
        <li key={p.key}>
          <figure>
            <div className="relative aspect-[4/5]">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed */}
              <img src={p.url} alt="" loading="lazy" className="size-full rounded-xl bg-muted object-cover" />
              {p.kind ? <span className="absolute bottom-2 right-2 rounded-full bg-foreground/80 px-2 text-xs text-background">{p.kind}</span> : null}
              {onRemove ? (
                <button
                  type="button"
                  aria-label={`Remove ${p.title}`}
                  disabled={busyKey !== null}
                  onClick={() => onRemove(p)}
                  className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {busyKey === p.key ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <X className="size-4" aria-hidden="true" />
                  )}
                </button>
              ) : null}
            </div>
            <figcaption className="truncate pt-2 text-center text-xs">{p.title}</figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
