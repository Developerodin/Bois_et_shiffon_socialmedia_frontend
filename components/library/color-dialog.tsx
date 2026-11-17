"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/components/settings/api";
import { cn } from "@/lib/utils";
import { HUES, SHADES, hslToHex, nearestHue, normalizeHex, shade } from "@/shared";
import { colorHint, paletteAfter } from "./api";

/** The phone's English hue names (onboarding:brand.hues). */
const HUE_LABEL: Record<string, string> = {
  red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", teal: "Teal",
  blue: "Blue", purple: "Purple", pink: "Pink", brown: "Brown", grey: "Grey",
};

type Index = number | "new";
type Props = {
  colors: string[];
  index: Index | null;
  onClose: () => void;
  onSave: (hexes: string[]) => Promise<void>;
  /** Where focus goes once the dialog closes; call preventDefault to override the return to the opener. */
  onCloseAutoFocus?: (e: Event) => void;
};

/**
 * Change, remove or add one colour (`index: "new"`), as the phone's colour sheet. Saves the whole palette; a failed
 * save keeps the dialog open with a message, so nothing is lost silently.
 */
export function ColorDialog({ colors, index, onClose, onSave, onCloseAutoFocus }: Props) {
  const [saving, setSaving] = useState(false);
  return (
    // While a save is in flight the dialog stays put (Escape, outside click and the close button do nothing).
    <Dialog open={index !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      {/* Keyed: a fresh editor (and starting value) for each opening. */}
      {index !== null ? <Editor key={String(index)} colors={colors} index={index} saving={saving} setSaving={setSaving} onClose={onClose} onSave={onSave} onCloseAutoFocus={onCloseAutoFocus} /> : null}
    </Dialog>
  );
}

function Editor({ colors, index, saving, setSaving, onClose, onSave, onCloseAutoFocus }: Omit<Props, "index"> & { index: Index; saving: boolean; setSaving: (v: boolean) => void }) {
  const [text, setText] = useState(index === "new" ? "#" : colors[index]);
  const [hue, setHue] = useState(() => nearestHue(normalizeHex(text)));
  const [error, setError] = useState("");

  const hex = normalizeHex(text);
  const hint = colorHint(text, colors, index);
  const duplicate = hex !== null && hint !== null;

  const pick = (h: string) => {
    setText(h);
    setError("");
  };

  async function save(next: string[]) {
    setSaving(true);
    setError("");
    try {
      await onSave(next);
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save. Your colours are unchanged. Try again."));
    } finally {
      setSaving(false);
    }
  }

  const hueLabel = HUE_LABEL[HUES[hue].key];
  return (
    <DialogContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader>
        <DialogTitle>{index === "new" ? "Add colour" : "Edit colour"}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Pick a colour, then a shade</p>
        <div className="flex flex-wrap gap-2">
          {HUES.map((c, i) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={i === hue}
              aria-label={HUE_LABEL[c.key]}
              disabled={saving}
              onClick={() => {
                setHue(i);
                pick(hslToHex(c.h, c.s, 50));
              }}
              style={{ backgroundColor: hslToHex(c.h, c.s, 50) }}
              className={cn(
                "size-9 rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                i === hue && "ring-2 ring-foreground ring-offset-2",
              )}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {SHADES.map((sh) => {
            const h = hslToHex(HUES[hue].h, HUES[hue].s, sh.l);
            return (
              <button
                key={sh.key}
                type="button"
                aria-pressed={h === hex}
                aria-label={`${hueLabel}, ${sh.key}`}
                disabled={saving}
                onClick={() => pick(h)}
                style={{ backgroundColor: h }}
                className={cn(
                  "h-11 flex-1 rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  h === hex && "ring-2 ring-foreground ring-offset-2",
                )}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="size-11 shrink-0 rounded-xl border border-border" style={{ backgroundColor: hex ?? "transparent" }} />
          <Button variant="outline" className="h-11 flex-1" disabled={!hex || saving} onClick={() => hex && pick(shade(hex, 8))}>
            Lighter
          </Button>
          <Button variant="outline" className="h-11 flex-1" disabled={!hex || saving} onClick={() => hex && pick(shade(hex, -8))}>
            Darker
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="color-hex" className="text-sm font-medium">Or type a hex code</label>
        <Input
          id="color-hex"
          value={text}
          onChange={(e) => pick(e.target.value)}
          maxLength={7}
          placeholder="#7C6754"
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          aria-describedby="color-hint"
          className="h-11 font-mono"
        />
        {/* Words, not just colour; quiet until something is typed past the "#". */}
        <p id="color-hint" aria-live="polite" className={cn("min-h-5 text-sm", hint ? "text-destructive" : "text-muted-foreground")}>
          {text.length > 1 ? hint : null}
        </p>
        <p role="alert" className="text-sm text-destructive">{error}</p>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" disabled={saving}>Cancel</Button>
        </DialogClose>
        {index !== "new" && colors.length > 1 ? (
          <Button variant="outline" disabled={saving} onClick={() => void save(paletteAfter(colors, index, null))}>
            Remove colour
          </Button>
        ) : null}
        <Button disabled={!hex || duplicate || saving} onClick={() => hex && void save(paletteAfter(colors, index, hex))}>
          Save colour
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
