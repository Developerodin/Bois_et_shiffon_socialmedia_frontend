"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CHAT_MESSAGE_MAX, type ChatTurn, type ReelDetail, type ReelOptions, type ReelPlan } from "@/shared";
import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Textarea } from "@/components/ui/textarea";
import { fetchShared } from "@/components/workspace/use-job";
import { isRepeatClick } from "@/lib/presser";
import { cn } from "@/lib/utils";
import { reelUrl } from "./api";
import { STAGE_LABELS, TEMPLATE_LABELS, chipMessage } from "./labels";
import { TOO_LONG } from "./plan-stream";
import { durationChips, editLock } from "./reel";
import { Draft } from "./start-card";
import { useReelStream } from "./use-reel-stream";

export type Body =
  | { kind: "message"; message: string }
  | { kind: "template"; templateId: string }
  | { kind: "presenter"; presenterId: string; message: string };

/** The composer's own sends (typed text, a chip, a template, Try again): they show the pending bubble and can be retried here. A presenter send's text and errors belong to the Presenter step. */
export const isComposerSend = (body: Body): boolean => body.kind !== "presenter";

/**
 * The Plan step's send state: the stream, the composer's text, the last send and its failure. Held by the reel page,
 * not the step, so a send keeps going (and lands in the reel) when the person opens another step meanwhile.
 */
export function usePlanChat(w: string, b: string, reelId: string) {
  const stream = useReelStream(w, b);
  const { revise, error } = stream;
  const [text, setText] = useState("");
  const [sent, setSent] = useState<{ body: Body; version: number } | null>(null);
  const [failed, setFailed] = useState<Body | null>(null);
  const [ready, setReady] = useState(false);

  // The reply may still land after the wait ran out: read the reel again so it shows when it does.
  useEffect(() => {
    if (error === TOO_LONG) void fetchShared(reelUrl(w, b, reelId), true).catch(() => undefined);
  }, [error, w, b, reelId]);

  // Try again sends the same body, so the revise presser reuses the kept request id: the reply can't be written twice.
  const send = useCallback(async (version: number, body: Body) => {
    setReady(false);
    setFailed(null);
    const composer = isComposerSend(body);
    if (composer) setSent({ body, version });
    // Only the composer's own send empties it: a chip or Try again leaves what the person has typed.
    if (body.kind === "message") setText((t) => (t.trim() === body.message ? "" : t));
    const ok = await revise(reelId, version, body);
    if (ok) {
      if (composer) setReady(true);
      return;
    }
    if (composer) setFailed(body);
    // The person's text goes back in the box, unless they typed something new meanwhile.
    if (body.kind === "message") setText((t) => (t.trim() ? t : body.message));
  }, [revise, reelId]);

  return { stream, text, setText, sent, failed, ready, send };
}

export type PlanChat = ReturnType<typeof usePlanChat>;

const BUBBLE = "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm";

/** The chat with the scriptwriter, and the person's just-sent text at once. Memoised: draft lines don't re-render it. */
const ChatLog = memo(function ChatLog({ chat, pending }: { chat: ChatTurn[]; pending: string | null }) {
  return (
    <ol role="log" aria-label="Chat with the scriptwriter" className="flex flex-col gap-3">
      {chat.map((t, i) => (
        <li key={`${t.at}-${i}`} className={cn("flex", t.role === "user" && "justify-end")}>
          <p className={cn(BUBBLE, t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
            <span className="sr-only">{t.role === "user" ? "You: " : "Scriptwriter: "}</span>
            {t.text}
          </p>
        </li>
      ))}
      {pending ? (
        <li className="flex justify-end">
          <p className={cn(BUBBLE, "bg-primary text-primary-foreground")}>
            <span className="sr-only">You: </span>
            {pending}
          </p>
        </li>
      ) : null}
    </ol>
  );
});

/** The plan as it stands: title, length, the opening hook and the length chips. Memoised: draft lines don't re-render it. */
const PlanCard = memo(function PlanCard({ plan, seconds, canEdit, disabled, onChip }: {
  plan: ReelPlan;
  seconds: number | null;
  canEdit: boolean;
  disabled: boolean;
  onChip: (seconds: number) => void;
}) {
  const scenes = plan.scenes.length;
  const hook = plan.scenes[0]?.voiceText;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <div>
        <h3 className="font-medium">{plan.title}</h3>
        <p className="text-sm text-muted-foreground">
          {scenes === 1 ? "1 scene" : `${scenes} scenes`}
          {seconds !== null ? ` · ~${seconds} s` : ""}
        </p>
      </div>
      {hook ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Opening hook</p>
          <p className="text-sm">{hook}</p>
        </div>
      ) : null}
      {canEdit ? (
        <ul aria-label="Length" className="flex flex-wrap items-center gap-2">
          {seconds !== null ? <li className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">~{seconds} s now</li> : null}
          {durationChips(seconds).map((c) => (
            <li key={c}>
              <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChip(c)}>
                {c} s
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});

/** "Start from a template": the templates as radio cards, and Use, which re-plans the reel from the one picked. */
function Templates({ templates, disabled, onUse }: { templates: ReelOptions["templates"]; disabled: boolean; onUse: (id: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const options = templates.map((t) => {
    const label = TEMPLATE_LABELS[t.id] ?? { title: t.id, subtitle: "" };
    return { value: t.id, title: label.title, description: label.subtitle || undefined };
  });
  return (
    <section aria-labelledby="reel-templates" className="flex flex-col gap-3">
      <h3 id="reel-templates" className="font-medium">Start from a template</h3>
      <ChoiceCards legend="Templates" name="reel-template" value={picked} onChange={setPicked} options={options} columns={2} />
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={disabled || picked === null}
        onClick={(e) => {
          if (picked && !isRepeatClick(e)) onUse(picked);
        }}
      >
        Use
      </Button>
    </section>
  );
}

/**
 * The Plan step: the chat with the scriptwriter, the plan card with the length chips, a composer and the templates.
 * While a message is sent: the text shows at once, then the stage and the plan as it streams; "Plan ready" when it lands.
 */
export function PlanStep({ detail, options, canCreate, chat }: { detail: ReelDetail; options: ReelOptions | null; canCreate: boolean; chat: PlanChat }) {
  const { stream, text, setText, sent, failed, ready, send } = chat;
  const { sending, stage, draft, error } = stream;
  const lock = editLock(detail);
  const disabled = sending || lock !== null;
  const version = detail.version;
  const message = text.trim();

  // Shown until the reel read after the send holds the turn (its version moved), or the send failed.
  const pending = sent && sent.body.kind === "message" && !failed && (sending || version === sent.version) ? sent.body.message : null;
  const onChip = useCallback((s: number) => void send(version, { kind: "message", message: chipMessage(s) }), [send, version]);

  function submit() {
    if (!disabled && message !== "") void send(version, { kind: "message", message });
  }

  return (
    <div className="flex flex-col gap-5">
      <ChatLog chat={detail.chat} pending={pending} />

      {/* Outside the draft and the log, so each stage is announced once, not on every draft line. */}
      <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">{sending && stage ? STAGE_LABELS[stage] : ""}</p>
      {sending && draft ? <Draft draft={draft} /> : null}
      <p role="status" className="sr-only">{ready && !sending ? "Plan ready" : ""}</p>

      {detail.plan ? <PlanCard plan={detail.plan} seconds={detail.seconds} canEdit={canCreate} disabled={disabled} onChip={onChip} /> : null}

      {!canCreate ? (
        <p className="text-sm text-muted-foreground">Your role can view reels but not make them.</p>
      ) : (
        <>
          {lock ? <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">{lock}</p> : null}
          <div className="flex flex-col gap-3">
            <label htmlFor="reel-message" className="sr-only">Ask for changes</label>
            <Textarea
              id="reel-message"
              className="rounded-xl aria-disabled:opacity-50"
              rows={3}
              placeholder="Ask for changes…"
              value={text}
              maxLength={CHAT_MESSAGE_MAX}
              // While sending: read-only, not disabled, so focus stays in the box. Disabled only while the reel is locked.
              disabled={lock !== null}
              readOnly={sending}
              aria-disabled={sending || undefined}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter adds a line. Not while an input method is composing, nor on a held key's repeat.
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (!e.repeat) submit();
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={disabled || message === ""}
                onClick={(e) => {
                  if (!isRepeatClick(e)) submit();
                }}
              >
                {sending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                Send
              </Button>
              {failed && error !== null && !sending ? (
                <Button type="button" variant="outline" disabled={lock !== null} onClick={() => void send(version, failed)}>
                  Try again
                </Button>
              ) : null}
            </div>
            <p role="alert" className="text-sm text-destructive empty:hidden">{sending ? "" : (error ?? "")}</p>
          </div>

          {options && options.templates.length > 0 ? (
            <Templates templates={options.templates} disabled={disabled} onUse={(templateId) => void send(version, { kind: "template", templateId })} />
          ) : null}
        </>
      )}
    </div>
  );
}
