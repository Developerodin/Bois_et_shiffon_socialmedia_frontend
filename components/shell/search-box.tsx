"use client";

import { useEffect, useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { SEARCH_MAX as MAX, SEARCH_MIN as MIN, type SearchResultDto, type SearchResultsDto } from "@/shared";
import { okToDiscard } from "@/components/context/unsaved";
import { ApiError, errorMessage } from "@/components/settings/api";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchBrand } from "@/lib/tasks-api";
import { navigate, postHref, samePage, taskHref } from "@/lib/workspace-view";

const KINDS = [
  { key: "tasks", label: "Tasks" },
  { key: "projects", label: "Projects" },
  { key: "posts", label: "Posts" },
  { key: "products", label: "Products" },
  { key: "campaigns", label: "Campaigns" },
] as const;
const DEBOUNCE_MS = 250;

/** The results in kind order (tasks, projects, posts, products, campaigns), kinds with nothing left out. */
export function groupResults(r: SearchResultsDto): { label: string; items: SearchResultDto[] }[] {
  return KINDS.filter((k) => r[k.key].length > 0).map((k) => ({ label: k.label, items: r[k.key] }));
}

/** Where a result opens: tasks in a task peek, posts in the Overview's, projects on their page, products and campaigns filtered. */
export function resultHref(r: SearchResultDto, pathname: string, search: string): string {
  const id = encodeURIComponent(r.id);
  switch (r.kind) {
    case "task":
      return taskHref(pathname, search, r.id);
    case "project":
      return `/projects/${id}`;
    case "post":
      return postHref(pathname, search, r.id);
    case "product":
      return `/products?${new URLSearchParams({ q: r.title })}`;
    case "campaign":
      return `/?panel=content&cf_campaignId=${id}`;
  }
}

/** A dialog other than this search is open. */
function anotherDialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"]:not([data-search]), [role="alertdialog"]');
}

/** The empty answer's text: "Searching…" while what's typed has moved on from the term it answers. */
export function noMatchText(term: string, typed: string): string {
  return term === typed.trim() ? `Nothing matches “${term}”.` : "Searching…";
}

type State = { kind: "idle" } | { kind: "loading" } | { kind: "done"; results: SearchResultsDto; term: string } | { kind: "error"; message: string };

/**
 * Top-bar search over the active business (flag `tasks`, brand.read): Ctrl/Cmd+K opens it, typing searches after a
 * 250 ms pause, Enter opens the first result. The server allows 30 searches a minute; past that it says so quietly.
 */
export function SearchBox({ base }: { base: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const listId = useId();
  const hintId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        // Another dialog is open (a new task, a confirm): leave it be rather than stack search over it.
        if (anotherDialogOpen()) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < MIN) return setState({ kind: "idle" });
    const ctrl = new AbortController();
    setState((s) => (s.kind === "done" ? s : { kind: "loading" }));
    const t = setTimeout(() => {
      searchBrand(base, term.slice(0, MAX), ctrl.signal).then(
        (results) => setState({ kind: "done", results, term }),
        (e) => {
          if (ctrl.signal.aborted) return;
          setState({ kind: "error", message: e instanceof ApiError && e.status === 429 ? "That's a lot of searches. Wait a minute, then try again." : errorMessage(e, "Couldn't search. Try again.") });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, base]);

  const change = (o: boolean) => {
    setOpen(o);
    if (!o) setQ("");
  };
  const go = (r: SearchResultDto) => {
    const href = resultHref(r, pathname, window.location.search);
    // Leaving this page: ask about unsaved work here (a page's own peek asks itself when its URL changes).
    if (!samePage(href, pathname) && !okToDiscard()) return;
    change(false);
    navigate(router, href, pathname);
  };

  const groups = state.kind === "done" ? groupResults(state.results) : [];
  // Enter waits for the answer to what is typed now, not the one shown from a moment ago.
  const first = state.kind === "done" && state.term === q.trim() ? groups[0]?.items[0] : undefined;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" className={tool}>
        <Search className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Search</span>
        <kbd aria-hidden="true" className="hidden rounded-md border border-border px-1.5 text-xs font-normal text-muted-foreground lg:inline">
          Ctrl K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={change}>
        <DialogContent data-search="" className="top-[15%] translate-y-0 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Search this business</DialogTitle>
            <DialogDescription id={hintId}>Tasks, projects, posts, products and campaigns. Enter opens the first result.</DialogDescription>
          </DialogHeader>
          <Input
            type="search"
            autoFocus
            value={q}
            maxLength={MAX}
            placeholder="Type at least 3 letters"
            aria-label="Search"
            aria-describedby={hintId}
            aria-controls={listId}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && first) {
                e.preventDefault();
                go(first);
              }
            }}
          />
          <div id={listId} aria-live="polite" className="max-h-[50vh] min-h-12 overflow-y-auto">
            {state.kind === "loading" ? (
              <p className="py-2 text-sm text-muted-foreground">Searching…</p>
            ) : state.kind === "error" ? (
              <p className="py-2 text-sm text-muted-foreground">{state.message}</p>
            ) : state.kind === "done" && !groups.length ? (
              <p className="py-2 text-sm text-muted-foreground">{noMatchText(state.term, q)}</p>
            ) : (
              groups.map((g) => (
                <section key={g.label} aria-label={g.label} className="py-1">
                  <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">{g.label}</h3>
                  <ul>
                    {g.items.map((r) => (
                      <li key={`${r.kind}:${r.id}`}>
                        <button type="button" onClick={() => go(r)} className="w-full truncate rounded-lg px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {r.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
