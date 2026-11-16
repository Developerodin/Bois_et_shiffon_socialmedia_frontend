import { cn } from "@/lib/utils";

/** Shown the moment you click (loading.tsx), until the page's data arrives: a header, tiles and rows. */
export function PageSkeleton({ header = true }: { header?: boolean }) {
  const block = "rounded-lg bg-muted/60 motion-safe:animate-pulse";
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-8">
      {header ? (
        <div className="flex flex-col gap-3">
          <div className={cn(block, "h-3 w-28")} />
          <div className={cn(block, "h-8 w-64")} />
          <div className={cn(block, "h-4 w-96 max-w-full")} />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn(block, "h-24 rounded-xl")} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn(block, "h-12 rounded-xl")} />
        ))}
      </div>
    </div>
  );
}
