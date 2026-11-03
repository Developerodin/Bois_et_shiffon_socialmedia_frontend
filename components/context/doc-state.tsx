import type { ContextDocEntry } from "@/components/context/api";
import { cn } from "@/lib/utils";

type State = { key: "none" | "draft" | "confirmed"; label: string };

export function docState(entry: ContextDocEntry): State {
  if (!entry.latest) return { key: "none", label: "Not generated" };
  if (entry.latest.status === "CONFIRMED")
    return { key: "confirmed", label: "Reviewed" };
  // Agents read the latest version either way; reviewing is optional.
  return { key: "draft", label: "In use" };
}

const TONE: Record<State["key"], string> = {
  none: "border-border text-muted-foreground",
  draft: "border-primary/40 bg-primary/10 text-primary",
  confirmed: "border-success/40 bg-success/10 text-success",
};

export function DocStateBadge({ entry }: { entry: ContextDocEntry }) {
  const state = docState(entry);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE[state.key],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {state.label}
    </span>
  );
}
