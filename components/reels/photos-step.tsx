"use client";

import { memo, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import type { LibraryPhoto, ReelDetail } from "@/shared";
import { Button } from "@/components/ui/button";
import { editLock, slotStandIns, swapScenes } from "./reel";
import type { ReelSave } from "./use-reel-save";

// The picker is only fetched when a photo is first changed, so it stays out of the reel page's first load.
const LibraryPicker = dynamic(() => import("@/components/library/library-picker").then((m) => m.LibraryPicker), { ssr: false });

type Edit = { version: number; keys: string[] };
type Dir = "earlier" | "later";

/**
 * The Photos step: one slot per scene, each photo changeable from the library and the order changeable. All edits stay
 * here until Save photos, which sends one save with the version the edit started from (a plan that moved meanwhile
 * gets the server's 409 and the edit stays). Memoised: the page passes it stable props, so stream frames skip it.
 */
export const PhotosStep = memo(function PhotosStep({ workspaceId, brandId, detail, canCreate, save, chatBusy }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  canCreate: boolean;
  save: ReelSave;
  chatBusy: boolean;
}) {
  const plan = detail.plan;
  const [edit, setEdit] = useState<Edit | null>(null);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [moved, setMoved] = useState("");
  // The reel page's save error is shared by every step: show it here only after this step's own Save press.
  const [tried, setTried] = useState(false);
  const [focus, setFocus] = useState<{ slot: number; dir: Dir; n: number } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // Photos picked this session, for display until the saved reel brings their links.
  const picked = useRef(new Map<string, string>());

  useEffect(() => {
    if (focus) buttons.current.get(`${focus.slot}-${focus.dir}`)?.focus();
  }, [focus]);

  if (!plan) return <p className="text-sm text-muted-foreground">Plan a reel first: photos belong to its scenes.</p>;

  // A re-read plan with another scene count: the edit no longer lines up, so it is dropped.
  if (edit && edit.keys.length !== plan.scenes.length) {
    setEdit(null);
    setNote("The plan changed: pick the photos again.");
  }

  const planKeys = plan.scenes.map((s) => s.photoKey);
  const keys = edit && edit.keys.length === planKeys.length ? edit.keys : planKeys;
  const dirty = keys.some((k, i) => k !== planKeys[i]);
  const standIns = slotStandIns(keys, plan);
  const lock = editLock(detail);
  const editable = lock === null && canCreate;
  const busy = chatBusy || save.saving;
  const last = keys.length - 1;

  const change = (next: string[]) => {
    setNote("");
    setEdit({ version: edit?.version ?? detail.version, keys: next });
  };

  function move(i: number, dir: Dir) {
    const j = dir === "earlier" ? i - 1 : i + 1;
    change(swapScenes(keys, i, j));
    setMoved(`Photo moved to scene ${j + 1} of ${keys.length}.`);
    // Focus follows the photo: the same button, or the other one when this one is now disabled.
    const at = dir === "earlier" && j === 0 ? "later" : dir === "later" && j === last ? "earlier" : dir;
    setFocus((f) => ({ slot: j, dir: at, n: (f?.n ?? 0) + 1 }));
  }

  function use(photo: LibraryPhoto) {
    if (pickFor === null) return;
    picked.current.set(photo.key, photo.url);
    change(keys.map((k, i) => (i === pickFor ? photo.key : k)));
    setPickFor(null);
  }

  async function savePhotos() {
    if (!edit || !plan) return;
    setTried(true);
    save.clear();
    const out = await save.save(edit.version, { ...plan, scenes: plan.scenes.map((s, i) => ({ ...s, photoKey: edit.keys[i] ?? s.photoKey })) });
    if (out) setEdit(null);
  }

  const btn = (slot: number, dir: Dir) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(`${slot}-${dir}`, el);
    else buttons.current.delete(`${slot}-${dir}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {editable ? "Pick the photo for each scene, or move a photo to another scene. Nothing changes until you save." : "The photo for each scene."}
      </p>
      {lock ? <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">{lock}</p> : null}
      {!canCreate ? <p className="text-sm text-muted-foreground">Your role can view reels but not make them.</p> : null}
      {note ? <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">{note}</p> : null}

      <ol className="flex flex-col gap-3">
        {plan.scenes.map((s, i) => {
          const key = keys[i] ?? s.photoKey;
          const url = picked.current.get(key) ?? detail.photoUrls[key];
          return (
            <li key={i} className="flex gap-4 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
              <div className="h-28 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, as in the library grid */}
                {url ? <img src={url} alt={s.shot} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="flex min-w-0 flex-col gap-2 text-sm">
                <h3 className="font-medium">Scene {i + 1}</h3>
                <p className="text-muted-foreground">{s.shot}</p>
                {standIns[i] ? <p className="text-xs text-destructive">Stand-in: this photo doesn&apos;t show what the scene talks about.</p> : null}
                {editable ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setPickFor(i)}>Change photo</Button>
                    <Button type="button" variant="ghost" size="sm" ref={btn(i, "earlier")} disabled={busy || i === 0} onClick={() => move(i, "earlier")}>
                      <ArrowUp className="size-4" aria-hidden="true" />
                      Move earlier
                    </Button>
                    <Button type="button" variant="ghost" size="sm" ref={btn(i, "later")} disabled={busy || i === last} onClick={() => move(i, "later")}>
                      <ArrowDown className="size-4" aria-hidden="true" />
                      Move later
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p role="status" aria-live="polite" className="sr-only">{moved}</p>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={busy || !dirty} onClick={() => void savePhotos()}>
            {save.saving ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            Save photos
          </Button>
        </div>
      ) : null}
      <p role="alert" className="text-sm text-destructive empty:hidden">{tried && !save.saving ? (save.error ?? "") : ""}</p>

      {pickFor !== null ? (
        <LibraryPicker
          workspaceId={workspaceId}
          brandId={brandId}
          open
          onOpenChange={(o) => { if (!o) setPickFor(null); }}
          selectedKey={keys[pickFor]}
          canUpload={canCreate}
          title={`Photo for scene ${pickFor + 1}`}
          onUse={use}
        />
      ) : null}
    </div>
  );
});
