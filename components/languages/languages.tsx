"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { request } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { SLOW_MS } from "@/lib/net";
import { cn } from "@/lib/utils";
import { CONTENT_LANGUAGES, isContentLanguage, languageName, type BrandLanguages, type ContentLanguage } from "@/shared";

/** `base`: a brand's API path, /api/v1/workspaces/:w/brands/:b. */
export const brandBase = (workspaceId: string, brandId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;

export type TranslatedIdea = { id: string; title: string; summary: string; reason: string };

export const languagesApi = {
  get: (base: string) => request<BrandLanguages>(`${base}/languages`),
  save: (base: string, patch: Partial<Record<keyof BrandLanguages, ContentLanguage>>) =>
    request<BrandLanguages>(`${base}/languages`, { method: "PATCH", body: JSON.stringify(patch) }),
  /** Machine translation of ideas (≤ 20 ids a call) or one document version: shown only, never saved. A long
   *  document is several AI calls, so these wait as long as other slow work (SLOW_MS), not the 30 s default. */
  ideas: (base: string, to: ContentLanguage, opportunityIds: string[]) =>
    request<{ opportunities: TranslatedIdea[] }>(`${base}/translate`, { method: "POST", body: JSON.stringify({ to, opportunityIds }), timeoutMs: SLOW_MS }),
  doc: (base: string, to: ContentLanguage, kind: string, version: number) =>
    request<{ markdown: string }>(`${base}/translate`, { method: "POST", body: JSON.stringify({ to, doc: { kind, version } }), timeoutMs: SLOW_MS }),
};

// What this tab knows about each brand's languages, so a run doesn't ask the server again once a team language is set.
const known = new Map<string, BrandLanguages>();
export const rememberLanguages = (base: string, l: BrandLanguages) => void known.set(base, l);
// Brands this tab already asked about whose answer couldn't be saved (no right to edit settings, or offline): not
// asked again until the page reloads, so "asked once" holds for them too.
const askedUnsaved = new Set<string>();
// One question per brand at a time: a run started while it's being asked waits for the same answer.
const inFlight = new Map<string, Promise<void>>();
/** The team language this tab has seen for a brand (null when not known or not set). */
export const knownWorkLanguage = (base: string) => known.get(base)?.workLanguage ?? null;

/** The person closed the language question: no run, and nothing to report. */
export class RunCancelled extends Error {
  constructor() {
    super("Run cancelled");
    this.name = "RunCancelled";
  }
}
export const isRunCancelled = (e: unknown) => e instanceof RunCancelled;

type Ask = { base: string; current: BrandLanguages; resolve: (go: boolean) => void };
let ask: Ask | null = null;
const listeners = new Set<() => void>();
/** Listen for the run's language question (the dialog does; a page without one lets runs through unasked). */
export const onLanguageQuestion = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const setAsk = (a: Ask | null) => {
  ask = a;
  listeners.forEach((l) => l());
};

/**
 * Before any agent run started from the web: once a business has no team language yet, ask for it (and the post
 * language) first. Resolves to go ahead; throws RunCancelled when the person closes the question. If the languages
 * can't be read, the run goes ahead as before rather than being blocked.
 */
export function ensureWorkLanguage(base: string): Promise<void> {
  if (known.get(base)?.workLanguage || askedUnsaved.has(base)) return Promise.resolve();
  // No dialog on this page (the welcome flow sits outside the app shell): run as before rather than wait forever.
  if (!listeners.size) return Promise.resolve();
  const pending = inFlight.get(base);
  if (pending) return pending;
  const run = (async () => {
    let current: BrandLanguages;
    try {
      current = await languagesApi.get(base);
    } catch {
      return;
    }
    known.set(base, current);
    if (current.workLanguage) return;
    // Another brand's question is already open (two tabs of runs at once): this run waits for a later click.
    if (ask) throw new RunCancelled();
    const go = await new Promise<boolean>((resolve) => setAsk({ base, current, resolve }));
    if (!go) throw new RunCancelled();
  })();
  const shared = run.finally(() => inFlight.delete(base));
  inFlight.set(base, shared);
  return shared;
}

/** What Translate translates into: the team working language, or English when none is set or it can't be read. */
async function teamLanguage(base: string): Promise<ContentLanguage> {
  const k = known.get(base);
  if (k?.workLanguage) return k.workLanguage;
  try {
    const l = await languagesApi.get(base);
    known.set(base, l);
    return l.workLanguage ?? "en";
  } catch {
    return "en";
  }
}

// Translations kept for this tab's session, so Show original / Translate again and re-opening cost nothing.
const ideaCache = new Map<string, TranslatedIdea>();
const docCache = new Map<string, string>();

/** Ideas in the team language, by id (20 per request, the server's cap). Only shown, never saved. */
export async function translateIdeas(base: string, ids: string[]): Promise<Map<string, TranslatedIdea>> {
  const to = await teamLanguage(base);
  const key = (id: string) => `${base}|${to}|${id}`;
  const missing = ids.filter((id) => !ideaCache.has(key(id)));
  const chunks = Array.from({ length: Math.ceil(missing.length / 20) }, (_, i) => missing.slice(i * 20, i * 20 + 20));
  // Two requests at a time: 100 ideas don't wait five times in a row.
  for (let i = 0; i < chunks.length; i += 2) {
    const replies = await Promise.all(chunks.slice(i, i + 2).map((c) => languagesApi.ideas(base, to, c)));
    for (const { opportunities } of replies) for (const o of opportunities) ideaCache.set(key(o.id), o);
  }
  return new Map(ids.flatMap((id) => (ideaCache.has(key(id)) ? [[id, ideaCache.get(key(id))!] as const] : [])));
}

/** One document version in the team language. Only shown, never saved. */
export async function translateDoc(base: string, kind: string, version: number): Promise<string> {
  const to = await teamLanguage(base);
  const key = `${base}|${to}|${kind}|${version}`;
  const hit = docCache.get(key);
  if (hit !== undefined) return hit;
  const { markdown } = await languagesApi.doc(base, to, kind, version);
  docCache.set(key, markdown);
  return markdown;
}

/** The Translate / Show original switch; says "Machine translation" while one is shown. */
export function TranslateToggle({ on, busy, onTranslate, onOriginal }: { on: boolean; busy: boolean; onTranslate: () => void; onOriginal: () => void }) {
  return on ? (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      Machine translation
      <Button size="sm" variant="ghost" onClick={onOriginal}>
        Show original
      </Button>
    </span>
  ) : (
    <Button size="sm" variant="ghost" onClick={onTranslate} disabled={busy}>
      {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Languages aria-hidden="true" className="size-4" />}
      {busy ? "Translating…" : "Translate"}
    </Button>
  );
}

/** The browser's language when we offer it, else English: the likely team language. */
const browserLanguage = (): ContentLanguage => {
  const code = typeof navigator === "undefined" ? "en" : navigator.language.slice(0, 2);
  return isContentLanguage(code) ? code : "en";
};

/** The two language selects, shared by the run question and Settings → Languages. */
export function LanguageSelects({
  work,
  post,
  onChange,
  disabled,
}: {
  work: ContentLanguage;
  post: ContentLanguage;
  onChange: (next: { work: ContentLanguage; post: ContentLanguage }) => void;
  disabled?: boolean;
}) {
  const options = CONTENT_LANGUAGES.map((l) => (
    <option key={l} value={l}>
      {languageName(l)}
    </option>
  ));
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Team working language</span>
        <span className="text-xs text-muted-foreground">Ideas, reasons, briefs, reports and documents for your team.</span>
        <select value={work} disabled={disabled} onChange={(e) => onChange({ work: e.target.value as ContentLanguage, post })} className={cn(selectClass, "sm:max-w-xs")}>
          {options}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Post language</span>
        <span className="text-xs text-muted-foreground">Captions, posts and stories your customers read.</span>
        <select value={post} disabled={disabled} onChange={(e) => onChange({ work, post: e.target.value as ContentLanguage })} className={cn(selectClass, "sm:max-w-xs")}>
          {options}
        </select>
      </label>
    </div>
  );
}

/** The run's language question; mounted once in the shell (like the paywall dialog). */
export function LanguageDialog() {
  const current = useSyncExternalStore(
    onLanguageQuestion,
    () => ask,
    () => null,
  );
  const [choice, setChoice] = useState<{ work: ContentLanguage; post: ContentLanguage }>({ work: "en", post: "fr" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    // No post language yet: suggest the same as the team's, never a silent French.
    if (current) setChoice({ work: browserLanguage(), post: current.current.contentLanguage ?? browserLanguage() });
  }, [current]);
  if (!current) return null;

  const close = (go: boolean) => {
    current.resolve(go);
    setAsk(null);
  };
  const save = async () => {
    setSaving(true);
    try {
      known.set(current.base, await languagesApi.save(current.base, { workLanguage: choice.work, contentLanguage: choice.post }));
    } catch {
      // Not saved (a role that can run agents but not edit settings, or offline): the run still starts, as before,
      // and this tab doesn't ask again.
      askedUnsaved.add(current.base);
    } finally {
      setSaving(false);
      close(true);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && close(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Which languages should agents write in?</DialogTitle>
          <DialogDescription>Asked once for this business. You can change both any time in Settings → Languages.</DialogDescription>
        </DialogHeader>
        <LanguageSelects work={choice.work} post={choice.post} onChange={setChoice} disabled={saving} />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save and run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
