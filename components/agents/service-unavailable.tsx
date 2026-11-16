import { ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ServiceUnavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-destructive/40 bg-destructive/5 px-6 py-5"
    >
      <div className="flex items-start gap-3">
        <ServerCrash className="mt-0.5 size-5 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-medium text-foreground">Agent service unavailable</p>
          <p className="text-sm text-muted-foreground">
            We could not reach the agent service. It will retry automatically.
          </p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry now
        </Button>
      ) : null}
    </div>
  );
}
