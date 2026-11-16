"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, FileText, Loader2, Pencil } from "lucide-react";
import {
  confirmContextDoc,
  ProblemError,
  saveContextDoc,
  type ContextDocEntry,
} from "@/components/context/api";
import { DocStateBadge } from "@/components/context/doc-state";
import { Markdown } from "@/components/context/markdown";
import { okToDiscard, setUnsaved } from "@/components/context/unsaved";
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
  /** Hide the write controls from people whose role can't use them (default: shown). */
  canEdit?: boolean;
  canConfirm?: boolean;
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
  canEdit = true,
  canConfirm: mayConfirm = true,
}: Props) {
  const { latest } = entry;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // The version the edit started from (as DraftEditor does): a newer one saved meanwhile must hit the 409, not be
  // overwritten. After a 409 the board refetches; once the newer version lands, saving builds on it.
  const [base, setBase] = useState<{ version: number | null; markdown: string }>({ version: null, markdown: "" });
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<"save" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = editing && draft !== base.markdown;
  const newest = latest?.version ?? null;
  useEffect(() => {
    if (!conflict || newest === base.version) return;
    setBase((b) => ({ ...b, version: newest }));
    setConflict(false);
  }, [conflict, newest, base.version]);

  // Unsaved text: closing or reloading the tab asks first, and so does anything in the app that would close the
  // editor (okToDiscard). In-app links are caught here before Next.js handles them.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const onLink = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest("a[href]");
      // SVG links (no string href), downloads and "#" links don't leave the page.
      if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download") || a.getAttribute("href") === "#") return;
      if (a.target === "_blank" || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const to = new URL(a.href, window.location.href);
      if (to.origin !== window.location.origin) return; // a full page load: beforeunload asks
      // Same page (a #hash, or another view of the workspace): the page stays mounted, and the workspace asks
      // itself when its view changes, so asking here too would ask twice.
      if (to.pathname === window.location.pathname) return;
      if (!okToDiscard()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    setUnsaved(true);
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onLink, true);
    return () => {
      setUnsaved(false);
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onLink, true);
    };
  }, [dirty]);

  function startEdit() {
    setDraft(latest?.markdown ?? "");
    setBase({ version: latest?.version ?? null, markdown: latest?.markdown ?? "" });
    setConflict(false);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (!okToDiscard()) return;
    setEditing(false);
  }

  async function onSave() {
    setBusy("save");
    setError(null);
    try {
      const { doc } = await saveContextDoc(workspaceId, brandId, entry.kind, {
        markdown: draft,
        baseVersion: base.version,
      });
      onChanged({ ...entry, latest: doc });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "save"));
      if (err instanceof ProblemError && err.status === 409) {
        setConflict(true);
        onStale();
      }
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

  const canConfirm = mayConfirm && latest?.status === "DRAFT" && !editing;

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
              <>
                <span className="tabular-nums">v{latest.version}</span>
                <span>
                  {latest.createdBy === "agent"
                    ? "Research agent"
                    : "Edited by your team"}
                </span>
                <span>{formatDate(latest.createdAt)}</span>
              </>
            ) : null}
          </div>
        </div>
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              onClick={startEdit}
              disabled={busy !== null}
            >
              <Pencil />
              {latest ? "Edit" : "Write it yourself"}
            </Button>
            ) : null}
            {canConfirm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onConfirm()}
                disabled={busy !== null}
              >
                {busy === "confirm" ? (
                  <Loader2 className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Check />
                )}
                {busy === "confirm" ? "Marking…" : "Mark reviewed"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

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
            Markdown. Saving creates a new draft version; it does not change what agents use until you confirm it.
            {base.version !== null ? ` Saving will build on v${base.version}.` : ""}
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
              onClick={cancelEdit}
              disabled={busy === "save"}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={
                busy === "save" || !draft.trim() || !dirty
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
            className="text-xs font-medium text-muted-foreground"
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
