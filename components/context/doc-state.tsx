import type { ContextDocEntry } from "@/components/context/api";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/lib/status";

type State = { key: "none" | "draft" | "confirmed"; label: string };

export function docState(entry: ContextDocEntry): State {
  if (!entry.latest) return { key: "none", label: "Not generated" };
  if (entry.latest.status === "CONFIRMED")
    return { key: "confirmed", label: "Reviewed" };
  // Agents read the latest version either way; reviewing is optional.
  return { key: "draft", label: "In use" };
}

const TONE: Record<State["key"], Tone> = { none: "muted", draft: "info", confirmed: "good" };

export function DocStateBadge({ entry }: { entry: ContextDocEntry }) {
  const state = docState(entry);
  return (
    <StatusBadge tone={TONE[state.key]} className="gap-1.5">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {state.label}
    </StatusBadge>
  );
}
