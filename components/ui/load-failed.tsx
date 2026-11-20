import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A load failed with nothing to show. No padding of its own: callers place it. `message` replaces the default line. */
export function LoadFailed({ what, onRetry, message, className }: { what: string; onRetry: () => void; message?: string; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm text-muted-foreground", className)}>
      {message ?? <>Couldn&rsquo;t load {what}. Try again.</>}
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
