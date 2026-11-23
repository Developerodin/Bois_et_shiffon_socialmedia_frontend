"use client";

import { useId, useState, type ReactNode } from "react";
import { safeHttpUrl, WEBSITE_CHANGE_KINDS, type TaskDetailDto, type TaskPersonDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { tasksApi } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";
import { TaskAttachments } from "@/components/tasks/task-attachments";
import { TASKS_CHANGED } from "@/components/tasks/task-views";
import type { TaskDraft } from "@/components/tasks/task-view";

export const CHANGE_KIND_LABEL: Record<string, string> = {
  PRODUCT_PAGE: "Product page",
  COLLECTION: "Collection",
  MENU: "Menu",
  HOMEPAGE: "Homepage",
  LANDING_PAGE: "Landing page",
  BUG: "Bug",
  CORRECTION: "Correction",
  OTHER: "Other",
};

/** The website fields as form inputs, inside the task's form (saved with its other fields). */
export function WebsiteInputs({ draft, set }: { draft: TaskDraft; set: <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => void }) {
  const ids = { url: useId(), kind: useId(), criteria: useId(), preview: useId() };
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-sm font-medium">Website</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.url} className="text-sm font-medium">
            Page address
          </label>
          <Input id={ids.url} type="url" inputMode="url" placeholder="https://" value={draft.url} maxLength={2_000} onChange={(e) => set("url", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.kind} className="text-sm font-medium">
            Kind of change
          </label>
          <select id={ids.kind} value={draft.changeKind} onChange={(e) => set("changeKind", e.target.value)} className={cn(selectClass, "pointer-coarse:h-11")}>
            <option value="">Not set</option>
            {WEBSITE_CHANGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {CHANGE_KIND_LABEL[k] ?? k}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.criteria} className="text-sm font-medium">
          Done when
        </label>
        <Textarea id={ids.criteria} value={draft.acceptanceCriteria} maxLength={4_000} placeholder="What the reviewer checks before approving" onChange={(e) => set("acceptanceCriteria", e.target.value)} className="min-h-20" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.preview} className="text-sm font-medium">
          Preview link
        </label>
        <Input id={ids.preview} type="url" inputMode="url" placeholder="https://" value={draft.previewUrl} maxLength={2_000} onChange={(e) => set("previewUrl", e.target.value)} />
      </div>
    </fieldset>
  );
}

/** An address as a link that opens in a new tab, only when it is a well-formed http(s) one; otherwise plain text. */
function ExternalLink({ href }: { href: string }) {
  const u = safeHttpUrl(href);
  if (!u) return <span className="break-all">{href}</span>;
  return (
    <a href={u.href} target="_blank" rel="noopener noreferrer" className="break-all text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {href}
    </a>
  );
}

/** The website fields as text, for people who can't edit them (a client reviewer reads the criteria and preview here). */
export function WebsiteFacts({ task }: { task: TaskDetailDto }) {
  const row = (term: string, value: ReactNode) => (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 flex-1 break-words">{value}</dd>
    </div>
  );
  return (
    <section aria-label="Website" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Website</h3>
      <dl className="flex flex-col gap-2 text-sm">
        {row("Page", task.url ? <ExternalLink href={task.url} /> : "Not set")}
        {row("Kind", task.changeKind ? CHANGE_KIND_LABEL[task.changeKind] ?? task.changeKind : "Not set")}
        {row("Preview", task.previewUrl ? <ExternalLink href={task.previewUrl} /> : "None")}
        {row("Done when", task.acceptanceCriteria ? <span className="whitespace-pre-wrap">{task.acceptanceCriteria}</span> : "Not set")}
      </dl>
    </section>
  );
}

/**
 * Before/After screenshots and "Checked on live site" (who and when). The button shows when the server lists the
 * checkedLive action for this person; its refusal (say, no page address yet) shows as text.
 */
export function WebsiteChecks(p: { base: string; task: TaskDetailDto; people: TaskPersonDto[] | null; canEditPhotos: boolean; onChanged: (t: TaskDetailDto) => void }) {
  const { base, task } = p;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checker = task.checkedLiveById ? (task.checkedLiveById === task.owner?.id ? task.owner : p.people?.find((x) => x.id === task.checkedLiveById)) : null;

  const check = async () => {
    setBusy(true);
    setError("");
    try {
      p.onChanged(await tasksApi.act(base, task.id, { action: "checkedLive" }));
      window.dispatchEvent(new Event(TASKS_CHANGED));
    } catch (e) {
      setError(errorMessage(e, "Couldn't mark it checked. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Screenshots and live check" className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Screenshots</h3>
      <TaskAttachments base={base} task={task} roles={["BEFORE", "AFTER"]} canEdit={p.canEditPhotos} slots />
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          {task.checkedLiveAt ? (
            <>
              Checked on live site{checker ? ` by ${checker.gone ? "someone no longer on this business" : checker.name}` : ""} on{" "}
              {new Date(task.checkedLiveAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </>
          ) : (
            <span className="text-muted-foreground">Not checked on the live site yet.</span>
          )}
        </p>
        {task.actions.includes("checkedLive") ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void check()}>
            {busy ? "Saving…" : task.checkedLiveAt ? "Checked again" : "Checked on live site"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
