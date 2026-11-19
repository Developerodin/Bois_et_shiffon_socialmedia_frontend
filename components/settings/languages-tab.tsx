"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { brandBase, LanguageSelects, languagesApi, rememberLanguages } from "@/components/languages/languages";
import { errorMessage } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import type { ContentLanguage } from "@/shared";

/**
 * Settings → Languages: the business's team working language (what agents write for the team) and post language (what
 * customers read). One pair per business, so changing it changes it for the whole team; agents use it from their next run.
 */
export function LanguagesTab({ workspaceId, brandId, canEdit }: { workspaceId: string; brandId: string; canEdit: boolean }) {
  const base = brandBase(workspaceId, brandId);
  const fetcher = useCallback(() => languagesApi.get(base), [base]);
  const { state, reload } = useLoad(fetcher);
  const [choice, setChoice] = useState<{ work: ContentLanguage; post: ContentLanguage } | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (state.kind === "loading") return <ListSkeleton label="Loading languages" rows={2} />;
  if (state.kind !== "ready") return <LoadError message={state.kind === "error" ? state.message : "You can't see this business's languages."} onRetry={reload} />;

  const saved = state.data;
  const shown = choice ?? { work: saved.workLanguage ?? "en", post: saved.contentLanguage ?? "fr" };
  const changed = shown.work !== saved.workLanguage || shown.post !== saved.contentLanguage;

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const next = await languagesApi.save(base, { workLanguage: shown.work, contentLanguage: shown.post });
      rememberLanguages(base, next);
      setChoice(null);
      reload();
      setNote({ ok: true, text: "Saved. Agents use these languages from their next run." });
    } catch (e) {
      setNote({ ok: false, text: errorMessage(e, "Couldn't save the languages. Try again.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="languages-h" className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 id="languages-h" className="text-lg font-semibold">
          Languages
        </h2>
        <p className="text-sm text-muted-foreground">
          For this business and everyone on its team. Ideas or documents already written stay as they are; use Translate on them to read them in another language.
        </p>
      </div>
      <LanguageSelects work={shown.work} post={shown.post} onChange={setChoice} disabled={!canEdit || saving} />
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={saving || !changed}>
            {saving ? "Saving…" : "Save languages"}
          </Button>
          {note ? (
            <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              {note.text}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner or admin to change these.</p>
      )}
    </section>
  );
}
