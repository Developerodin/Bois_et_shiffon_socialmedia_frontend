"use client";

import { useState } from "react";
import { Check, ExternalLink, FileText, Loader2, Pencil } from "lucide-react";
import {
  confirmContextDoc,
  ProblemError,
  saveContextDoc,
  type ContextDocEntry,
} from "@/components/context/api";
import { DocStateBadge } from "@/components/context/doc-state";
import { Markdown } from "@/components/context/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  entry: ContextDocEntry;
  workspaceId: string;
  brandId: string;
  researchActive: boolean;
  onChanged: (entry: ContextDocEntry) => void;
  /** Called after a 409 so the board refetches the newest versions. */
  onStale: () => void;
};

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

// Agent-supplied URLs: only link http(s), never javascript:/data: schemes.
function safeHref(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function errorMessage(err: unknown, action: "save" | "confirm") {
  if (err instanceof ProblemError) {
    if (err.status === 409) {
      return action === "save"
        ? "Someone saved a newer version while you were editing. Your text is still here; saving again will build on the newest version."
        : "A newer version exists. We loaded it; review it before confirming.";
    }
    if (err.status === 403) {
      return action === "save"
        ? "You do not have permission to edit this document."
        : "You do not have permission to confirm brand context.";
    }
    return err.message;
  }
  return action === "save"
    ? "Could not save the draft."
    : "Could not confirm the document.";
}

export function DocPane({
  entry,
  workspaceId,
  brandId,
  researchActive,
  onChanged,
  onStale,
}: Props) {
  const { latest, confirmed } = entry;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"save" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(latest?.markdown ?? "");
    setError(null);
    setEditing(true);
  }

  async function onSave() {
    setBusy("save");
    setError(null);
    try {
      const { doc } = await saveContextDoc(workspaceId, brandId, entry.kind, {
        markdown: draft,
        baseVersion: latest?.version ?? null,
      });
      onChanged({ ...entry, latest: doc });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "save"));
      if (err instanceof ProblemError && err.status === 409) onStale();
    } finally {
      setBusy(null);
    }
  }

  async function onConfirm() {
    if (!latest) return;
    setBusy("confirm");
    setError(null);
    try {
      const { doc } = await confirmContextDoc(
        workspaceId,
        brandId,
        entry.kind,
        latest.version,
      );
      onChanged({ ...entry, latest: doc, confirmed: doc });
    } catch (err) {
      setError(errorMessage(err, "confirm"));
      if (err instanceof ProblemError && err.status === 409) onStale();
    } finally {
      setBusy(null);
    }
  }

  const canConfirm = latest?.status === "DRAFT" && !editing;

  return (
    <article
      aria-labelledby="doc-title"
      className="flex min-w-0 flex-col gap-6 rounded-2xl border border-border bg-card p-6 sm:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2
            id="doc-title"
            className="font-display text-2xl font-medium tracking-tight"
          >
            {entry.title}
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <DocStateBadge entry={entry} />
            {latest ? (
              <span className="font-mono">
                v{latest.version} ·{" "}
                {latest.createdBy === "agent"
                  ? "Research agent"
                  : "Edited by your team"}{" "}
                · {formatDate(latest.createdAt)}
              </span>
            ) : null}
          </div>
        </div>
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={startEdit}
              disabled={busy !== null}
            >
              <Pencil />
              {latest ? "Edit" : "Write it yourself"}
            </Button>
            {canConfirm ? (
              <Button
                size="sm"
                onClick={() => void onConfirm()}
                disabled={busy !== null}
              >
                {busy === "confirm" ? (
                  <Loader2 className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Check />
                )}
                Confirm v{latest.version}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {latest?.status === "DRAFT" && confirmed ? (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground/90">
          Agents keep using v{confirmed.version} until you confirm this draft.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="doc-editor" className="text-xs text-muted-foreground">
            Markdown. Saving creates a new draft version
            {latest ? ` based on v${latest.version}` : ""}; it does not change
            what agents use until you confirm it.
          </label>
          <Textarea
            id="doc-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[24rem] font-mono text-sm leading-relaxed"
            disabled={busy === "save"}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={busy === "save"}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={
                busy === "save" || !draft.trim() || draft === latest?.markdown
              }
            >
              {busy === "save" ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : null}
              Save draft
            </Button>
          </div>
        </div>
      ) : latest ? (
        <Markdown source={latest.markdown} />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border px-6 py-10">
          <FileText className="size-5 text-primary" aria-hidden="true" />
          <p className="font-display text-lg">Not generated yet.</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {researchActive
              ? "The Research agent is working on it. This page updates on its own."
              : "Re-run research to draft it from your website, or write it yourself."}
          </p>
        </div>
      )}

      {!editing && latest && latest.sources.length > 0 ? (
        <section
          aria-labelledby="doc-sources"
          className="flex flex-col gap-3 border-t border-border pt-5"
        >
          <h4
            id="doc-sources"
            className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground"
          >
            Sources ({latest.sources.length})
          </h4>
          <ul className="flex flex-col gap-2 text-sm">
            {latest.sources.map((source, i) => {
              const href = safeHref(source.url);
              return (
                <li key={`${source.url}-${i}`} className="min-w-0">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                    >
                      <span className="truncate">
                        {source.title || source.url}
                      </span>
                      <ExternalLink
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                    </a>
                  ) : (
                    <span className="break-all text-muted-foreground">
                      {source.title || source.url}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
