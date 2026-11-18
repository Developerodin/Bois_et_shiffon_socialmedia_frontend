import type { ReactNode } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

/** One voice: its name, a detail line, a sample button when it has a sample, and a slot for what to do with it. */
export function VoiceRow({ name, prefix, detail, sampleUrl, playing, onToggle, action }: {
  name: string;
  /** Shown before the name, e.g. "Voice: ". */
  prefix?: string;
  detail?: ReactNode;
  sampleUrl: string | null;
  playing: boolean;
  onToggle: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{prefix}{name}</span>
        {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
      </div>
      {sampleUrl ? (
        <Button type="button" variant="outline" size="sm" aria-pressed={playing} onClick={onToggle}>
          {playing ? <Square className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          {playing ? "Stop sample" : `Play sample, ${name}`}
        </Button>
      ) : null}
      {action}
    </div>
  );
}
