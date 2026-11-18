"use client";

import { useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { LIBRARY_FILTERS, NAME_MAX, type LibraryFilters, type LibraryVoice, type ReelDetail, type ReelVoiceOption } from "@/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog, selectClass } from "@/components/settings/shared";
import { errorMessage } from "@/components/settings/api";
import { voicesApi } from "./api";
import type { ReelSave } from "./use-reel-save";
import { useSample } from "./use-sample";
import { useVoiceLibrary } from "./use-voice-library";
import { useVoices } from "./use-reels";
import { VoiceRow } from "./voice-row";
import { GENDER_LABELS, LIBRARY_LABELS, LIBRARY_TITLES, canManageClone, languageName } from "./voices";

// Copy: the phone's voices.* (mobile reels.json).
type Tab = "ours" | "library" | "clone";
type Picked = { id: string; name: string };
const FILTER_KEYS = ["language", "gender", "age", "useCase"] as const;

const filterWord = (key: (typeof FILTER_KEYS)[number], value: string): string =>
  key === "language" ? languageName(value) : ((LIBRARY_LABELS[key] as Record<string, string> | undefined)?.[value] ?? value);

/** One voice as a native radio (one tab stop, arrows move) beside its row. */
function Choice({ name, checked, disabled, onPick, children }: { name: string; checked: boolean; disabled?: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm has-[:checked]:border-primary">
      <input type="radio" name="voice" aria-label={name} checked={checked} disabled={disabled} onChange={onPick} className="size-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function RenameDialog({ voice, onClose, onSave }: { voice: ReelVoiceOption | null; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [seen, setSeen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if ((voice?.id ?? null) !== seen) {
    setSeen(voice?.id ?? null);
    setName(voice?.name ?? "");
    setError(null);
  }
  const trimmed = name.trim();

  async function save() {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={voice !== null} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename voice</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-3">
          <label htmlFor="voice-rename" className="text-sm font-medium">Name</label>
          <Input id="voice-rename" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} autoComplete="off" className="h-11 rounded-xl" />
          <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !trimmed}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Voices sheet: pick the reel's voice from the brand's own voices or the ElevenLabs library, and manage or add clones.
 * A radio only sets a local choice; Use this voice saves once, then closes. Its error is the sheet's own (the page-wide
 * save error belongs to whichever step pressed save). The Clone button joins when the clone dialog does (Task 9).
 */
export function VoicesSheet({ workspaceId, brandId, detail, save, open, onOpenChange }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  save: ReelSave;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the clone dialog: wired by the Script step, called by the Clone button Task 9 adds. */
  onClone: () => void;
}) {
  const plan = detail.plan;
  const { data, reload } = useVoices(workspaceId, brandId);
  const sample = useSample();
  const cloning = data?.cloning ?? null;
  const [tab, setTab] = useState<Tab>(plan?.voice.startsWith("library:") ? "library" : "ours");
  const library = useVoiceLibrary(workspaceId, brandId, open && tab === "library", plan?.language);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [tried, setTried] = useState(false);
  const [renaming, setRenaming] = useState<ReelVoiceOption | null>(null);
  const [removing, setRemoving] = useState<{ voice: ReelVoiceOption; withdraw: boolean } | null>(null);

  if (!plan) return null;
  const current = picked?.id ?? plan.voice;
  const clones = data?.voices.filter((v) => v.clone).length ?? 0;
  const tabs = [
    { value: "ours" as const, label: "Our voices" },
    { value: "library" as const, label: "Voice library" },
    ...(cloning?.allowed ? [{ value: "clone" as const, label: "Clone a voice" }] : []),
  ];
  // A tab that went away (cloning no longer allowed) falls back to the first.
  const shown: Tab = tabs.some((t) => t.value === tab) ? tab : "ours";

  function close(next: boolean) {
    if (!next) {
      sample.stop();
      setPicked(null);
      setTried(false);
    } else {
      save.clear();
    }
    onOpenChange(next);
  }

  async function use() {
    if (!picked || !plan) return;
    setTried(true);
    const out = await save.save(detail.version, { ...plan, voice: picked.id, voiceName: picked.name.slice(0, 80) });
    if (out) close(false);
  }

  async function remove(v: ReelVoiceOption, withdraw: boolean) {
    await voicesApi.remove(workspaceId, brandId, v.id, withdraw);
    if (picked?.id === v.id) setPicked(null);
    await reload().catch(() => undefined);
  }

  const play = (id: string, url: string | null) => () => { if (url) sample.toggle(id, url); };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Voices</SheetTitle>
          <SheetDescription>Listen to a sample, then pick the voice that reads your reel.</SheetDescription>
        </SheetHeader>
        <SegmentedRadios label="Voice source" name="voices-tab" value={shown} onChange={setTab} options={tabs} />

        {shown === "ours" ? (
          !data ? <p className="text-sm text-muted-foreground">Loading voices…</p> : (
            <ul className="flex flex-col gap-2">
              {data.voices.map((v) => (
                <Choice key={v.id} name={v.name} checked={current === v.id} onPick={() => setPicked({ id: v.id, name: v.name })}>
                  <VoiceRow
                    name={v.name}
                    detail={`${GENDER_LABELS[v.gender]}${v.mine ? " · Yours" : ""}`}
                    sampleUrl={v.sampleUrl}
                    playing={sample.playing === v.id}
                    onToggle={play(v.id, v.sampleUrl)}
                    action={canManageClone(v, cloning) ? (
                      <>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(v)}>Rename</Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Delete ${v.name}`} onClick={() => setRemoving({ voice: v, withdraw: false })}>Delete</Button>
                        {v.mine ? <Button type="button" variant="ghost" size="sm" aria-label={`Withdraw consent for ${v.name}`} onClick={() => setRemoving({ voice: v, withdraw: true })}>Withdraw consent and delete</Button> : null}
                      </>
                    ) : null}
                  />
                </Choice>
              ))}
            </ul>
          )
        ) : null}

        {shown === "library" ? (
          <LibraryTab library={library} current={current} onPick={setPicked} sample={sample} />
        ) : null}

        {shown === "clone" && cloning ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{clones} of {cloning.max} used</p>
            {clones >= cloning.max ? <p role="status" className="text-sm text-muted-foreground">This workspace has {cloning.max} cloned voices, the most it can have.</p> : null}
            {/* The "Clone a voice · N credits" button (calling onClone) comes with the clone dialog in Task 9. */}
          </div>
        ) : null}

        {picked && picked.id !== plan.voice ? (
          <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 border-t border-border bg-background px-6 py-4">
            <p role="alert" className="text-sm text-destructive empty:hidden">{tried ? save.error : null}</p>
            <Button type="button" disabled={save.saving} onClick={() => void use()}>
              {save.saving ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              Use this voice
            </Button>
          </div>
        ) : null}

        <RenameDialog voice={renaming} onClose={() => setRenaming(null)} onSave={async (name) => {
          if (!renaming) return;
          await voicesApi.rename(workspaceId, brandId, renaming.id, name);
          await reload().catch(() => undefined);
        }} />
        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(o) => { if (!o) setRemoving(null); }}
          title={removing ? `${removing.withdraw ? "Withdraw consent for" : "Delete"} ${removing.voice.name}?` : ""}
          description="The voice is deleted for the whole workspace, at ElevenLabs too. Reels using it need another voice. This can't be undone."
          confirmLabel={removing?.withdraw ? "Withdraw consent and delete" : "Delete"}
          onConfirm={async () => { if (removing) await remove(removing.voice, removing.withdraw); }}
        />
      </SheetContent>
    </Sheet>
  );
}

function LibraryTab({ library, current, onPick, sample }: {
  library: ReturnType<typeof useVoiceLibrary>;
  current: string;
  onPick: (p: Picked) => void;
  sample: ReturnType<typeof useSample>;
}) {
  const { fields, result, loading, loadingMore, error } = library;
  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); library.submit(); }}>
        <label htmlFor="voice-search" className="sr-only">Search voices</label>
        <Input id="voice-search" type="search" value={library.draft} onChange={(e) => library.setDraft(e.target.value)} placeholder="Search voices (name, style…)" autoComplete="off" className="h-11 rounded-xl" />
      </form>
      <div className="grid grid-cols-2 gap-2">
        {FILTER_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`voice-filter-${key}`} className="text-xs text-muted-foreground">{LIBRARY_TITLES[key]}</label>
            <select id={`voice-filter-${key}`} className={`${selectClass} rounded-xl`} value={fields[key]} onChange={(e) => library.set(key, e.target.value)}>
              <option value="">Any</option>
              {(LIBRARY_FILTERS[key] as readonly string[]).map((o) => <option key={o} value={o}>{filterWord(key, o)}</option>)}
            </select>
          </div>
        ))}
      </div>
      {library.narrowed ? (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={library.clear}>
          <X className="size-4" aria-hidden="true" />
          Clear
        </Button>
      ) : null}

      {result && !result.usable ? <p role="status" className="text-sm text-muted-foreground">You can listen to every library voice now. Reels can use them once our ElevenLabs plan is upgraded.</p> : null}
      <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
      {error && !loadingMore ? <Button type="button" variant="outline" size="sm" className="self-start" onClick={library.retry}>Try again</Button> : null}
      {!result && loading ? <p role="status" className="text-sm text-muted-foreground">Loading voices…</p> : null}
      {result && !result.voices.length && !loading ? <p className="text-sm text-muted-foreground">No voices match these filters.</p> : null}
      {result ? (
        <ul className={`flex flex-col gap-2 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {result.voices.map((v) => (
            <Choice key={v.id} name={v.name} checked={current === v.id} disabled={!result.usable} onPick={() => onPick({ id: v.id, name: v.name })}>
              <VoiceRow
                name={v.name}
                detail={libraryTraits(v)}
                sampleUrl={v.previewUrl}
                playing={sample.playing === v.id}
                onToggle={() => { if (v.previewUrl) sample.toggle(v.id, v.previewUrl); }}
              />
            </Choice>
          ))}
        </ul>
      ) : null}
      {result?.more ? (
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={loading || loadingMore} onClick={library.more}>
          {loadingMore ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          More voices
        </Button>
      ) : null}
    </div>
  );
}

/** "Female · Young · American": ElevenLabs' words, ours where we have them. */
function libraryTraits(v: LibraryVoice): string {
  const word = (key: "gender" | "age", value: string | null) => (value ? ((LIBRARY_LABELS[key] as Record<string, string> | undefined)?.[value] ?? value) : null);
  return [word("gender", v.gender), word("age", v.age), v.accent].filter(Boolean).join(" · ");
}
