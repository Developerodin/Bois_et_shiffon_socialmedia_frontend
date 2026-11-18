"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Opportunity } from "@/components/workspace/content-panels";

/** The brand's reel ideas (useReelIdeas' data), each with Use this idea. */
export function IdeasDialog({ open, onOpenChange, ideas, disabled, onUse }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideas: Opportunity[];
  /** A plan is already being written. */
  disabled: boolean;
  onUse: (idea: Opportunity) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Video ideas</DialogTitle>
          <DialogDescription>Pick one and the plan starts from it.</DialogDescription>
        </DialogHeader>
        {ideas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reel ideas yet. They appear here after the ideas agent runs.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ideas.map((idea) => (
              <li key={idea.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="text-sm font-medium">{idea.title}</p>
                {idea.summary ? <p className="text-sm text-muted-foreground">{idea.summary}</p> : null}
                <Button type="button" variant="outline" size="sm" className="self-start" disabled={disabled} onClick={() => onUse(idea)}>
                  Use this idea
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
