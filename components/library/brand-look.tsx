"use client";

import { useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { focusSectionHeading, PageSection } from "@/components/ui/page-section";
import { errorMessage } from "@/components/settings/api";
import { MAX_COLORS, TONE_GROUPS, type BrandAssetsView, type Tone } from "@/shared";
import { libraryApi } from "./api";
import { ColorDialog } from "./color-dialog";

const GROUP_LABEL = { feel: "Feel", style: "Style", positioning: "Positioning" } as const;

type Props = { workspaceId: string; brandId: string; view: BrandAssetsView; canEdit: boolean; set: (view: BrandAssetsView) => void };

/**
 * The brand look beside the photos, as the phone's brand settings: the palette (saved as soon as a colour is
 * edited), the logo used on reel endings, and the creative tones the writers follow (saved with Save changes).
 */
export function BrandLook({ workspaceId, brandId, view, canEdit, set }: Props) {
  const colors = view.assets?.colors.map((c) => c.hex) ?? [];
  const logo = view.assets?.logo ?? null;
  const [editing, setEditing] = useState<number | "new" | null>(null);
  // null = the saved tones; the person's picks once they touch them.
  const [picked, setPicked] = useState<Tone[] | null>(null);
  const tones = picked ?? view.preferences.tones ?? [];
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const addRef = useRef<HTMLButtonElement>(null);
  // The button that opened the dialog, and whether the last save dropped a colour (its swatch then shows another).
  const opener = useRef<Element | null>(null);
  const removed = useRef(false);

  const openEditor = (i: number | "new") => {
    opener.current = document.activeElement;
    removed.current = false;
    setEditing(i);
  };

  async function saveColors(hexes: string[]) {
    set(await libraryApi.edit(workspaceId, brandId, { colors: hexes }));
    removed.current = hexes.length < colors.length;
  }

  // Escape, Cancel and an edit return focus to the opening swatch (Radix's default). After a remove, or when the
  // opener is gone (the palette just filled up, so "Add colour" left), land on "Add colour" or the section heading.
  function focusAfterClose(e: Event) {
    if (!removed.current && opener.current?.isConnected) return;
    e.preventDefault();
    if (addRef.current) addRef.current.focus();
    else focusSectionHeading("palette");
  }

  const toggle = (tone: Tone) => {
    setStatus("");
    setError("");
    setPicked(tones.includes(tone) ? tones.filter((x) => x !== tone) : [...tones, tone]);
  };

  async function saveTones() {
    if (!picked) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      set(await libraryApi.edit(workspaceId, brandId, { tones: picked }));
      setPicked(null);
      setStatus("Saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageSection
        id="palette"
        title="Brand colour palette"
        actions={
          canEdit && view.assets && colors.length < MAX_COLORS ? (
            <Button ref={addRef} variant="outline" onClick={() => openEditor("new")}>
              <Plus aria-hidden="true" />
              Add colour
            </Button>
          ) : null
        }
      >
        {!view.assets ? (
          // No website read yet: colours come from Research (the server refuses a palette before that).
          <p className="text-sm text-muted-foreground">Your brand colours appear here once Research has read your website.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-wrap gap-3">
              {colors.map((hex, i) => {
                const swatch = (
                  <>
                    <span aria-hidden="true" className="size-8 rounded-full border border-border" style={{ backgroundColor: hex }} />
                    <span className="font-mono text-xs">{hex}</span>
                  </>
                );
                const box = "flex min-w-20 flex-col items-center gap-2 rounded-2xl border border-border px-3 py-3";
                return (
                  // Keyed by place, so an edited swatch stays the same element and focus can return to it.
                  <li key={i}>
                    {canEdit ? (
                      <button
                        type="button"
                        aria-label={`Edit colour ${hex}`}
                        onClick={() => openEditor(i)}
                        className={`${box} transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                      >
                        {swatch}
                      </button>
                    ) : (
                      <div className={box}>{swatch}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            {logo ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed */}
                <img src={logo.url} alt={`${view.name} logo`} className="size-10 shrink-0 rounded-lg bg-foreground object-contain p-1" />
                <div>
                  <p className="text-sm font-medium">Outro watermark logo</p>
                  <p className="text-sm text-muted-foreground">Applied to video reel endings and photo borders</p>
                </div>
              </div>
            ) : null}
          </div>
        )}
        <ColorDialog
          colors={colors}
          index={editing}
          onClose={() => setEditing(null)}
          onSave={saveColors}
          onCloseAutoFocus={focusAfterClose}
        />
      </PageSection>

      <PageSection id="tone" title="Creative tone">
        <div className="flex flex-col gap-4">
          {TONE_GROUPS.map((group) => (
            <fieldset key={group.key} disabled={!canEdit || saving} className="flex flex-col gap-2">
              <legend className="mb-2 text-xs text-muted-foreground">{GROUP_LABEL[group.key]}</legend>
              <div className="flex flex-wrap gap-2">
                {group.tones.map((tone) => {
                  const on = tones.includes(tone);
                  return (
                    <label
                      key={tone}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-border px-3 text-sm has-[:checked]:border-2 has-[:checked]:border-primary has-[:checked]:px-[11px] has-[:checked]:bg-accent has-[:checked]:text-primary-strong has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                    >
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(tone)} />
                      {tone}
                      {on ? <Check aria-hidden="true" className="size-3.5" /> : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {/* Always mounted so screen readers hear each change; empty lines take no height. */}
          <div>
            <p aria-live="polite" className="text-sm text-muted-foreground">{picked?.length === 0 ? "Pick at least one tone." : status}</p>
            <p role="alert" className="text-sm text-destructive">{error}</p>
          </div>
          {canEdit ? null : <p className="text-sm text-muted-foreground">Your role can&apos;t change the brand look.</p>}
          <div>
            <Button disabled={!canEdit || saving || picked === null || picked.length === 0} onClick={() => void saveTones()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </PageSection>
    </div>
  );
}
