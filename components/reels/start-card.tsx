"use client";

import { memo, useState } from "react";
import { Loader2 } from "lucide-react";
import { CHAT_MESSAGE_MAX, type DraftSoFar, type PlanStage } from "@/shared";
import { Button } from "@/components/ui/button";
import { PageSection } from "@/components/ui/page-section";
import { Textarea } from "@/components/ui/textarea";
import { isRepeatClick } from "@/components/photoshoot/press";
import { STAGE_LABELS } from "./labels";
import type { CreateBody } from "./plan-stream";
import type { Starter } from "./reel";

/** The plan as it streams in: its title and one line per scene. Memoised: a draft line re-renders only this. */
const Draft = memo(function Draft({ draft }: { draft: DraftSoFar }) {
  return (
    <div className="flex flex-col gap-2">
      {draft.title ? <p className="text-sm font-medium">{draft.title}</p> : null}
      {draft.scenes.length > 0 ? (
        <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
          {draft.scenes.map((s, i) => (
            <li key={i}>
              Scene {i + 1} · {s.shot}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
});

/** Plan a reel: a prompt and Plan, starters on an empty prompt, the ideas count, and the plan's progress while it streams. */
export function StartCard({ starters, ideaCount, onViewIdeas, onStart, sending, stage, draft, error }: {
  starters: Starter[];
  ideaCount: number;
  onViewIdeas: () => void;
  onStart: (body: CreateBody) => void;
  sending: boolean;
  stage: PlanStage | null;
  draft: DraftSoFar | null;
  error: string | null;
}) {
  const [prompt, setPrompt] = useState("");
  const text = prompt.trim();

  return (
    <PageSection id="plan-reel" title="Plan a reel">
      <div className="flex flex-col gap-4">
        <label htmlFor="reel-prompt" className="text-sm font-medium">What should your next reel be about?</label>
        <Textarea
          id="reel-prompt"
          className="rounded-xl"
          rows={3}
          value={prompt}
          maxLength={CHAT_MESSAGE_MAX}
          onChange={(e) => setPrompt(e.target.value)}
        />
        {/* Not a form: Enter in the prompt adds a line, it never starts a plan. */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={sending || text === ""}
            onClick={(e) => {
              if (!isRepeatClick(e)) onStart({ prompt: text });
            }}
          >
            {sending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            Plan
          </Button>
          {ideaCount > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">{ideaCount === 1 ? "1 reel idea ready" : `${ideaCount} reel ideas ready`}</span>
              <Button type="button" variant="outline" size="sm" onClick={onViewIdeas}>
                View ideas
              </Button>
            </>
          ) : null}
        </div>

        {text === "" && !sending && starters.length > 0 ? (
          <ul aria-label="Ways to start" className="flex flex-wrap gap-2">
            {starters.map((s) => (
              <li key={s.label}>
                <Button type="button" variant="outline" size="sm" onClick={() => onStart({ prompt: s.message, opportunityId: s.opportunityId })}>
                  {s.label}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Outside the draft, so each stage is announced once, not on every draft line. */}
        <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">{sending && stage ? STAGE_LABELS[stage] : ""}</p>
        {sending && draft ? <Draft draft={draft} /> : null}
        <p role="alert" className="text-sm text-destructive empty:hidden">{error ?? ""}</p>
      </div>
    </PageSection>
  );
}
