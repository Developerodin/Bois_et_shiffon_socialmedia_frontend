"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { LibraryPicker } from "@/components/library/library-picker";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { Textarea } from "@/components/ui/textarea";
import { workspaceIdOf } from "@/lib/plan-credits";
import { nowLocalInput } from "@/lib/time";
import { CONTENT_GOALS, CONTENT_GOAL_LABELS, type ContentGoal, type LibraryPhoto } from "@/shared";

export type NewPostChannel = "INSTAGRAM_POST" | "INSTAGRAM_CAROUSEL";
type Channel = NewPostChannel;
/** The channels New post can make (the server's NewPostInput); a calendar on one of them starts the dialog on it. */
export const NEW_POST_CHANNELS: readonly string[] = ["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL"] satisfies NewPostChannel[];
const DIRECTION_MAX = 500;

/**
 * "New post" for people who can create content: a product photo, a goal and a note, then the Creator drafts it and it opens.
 * With `open`/`onOpenChange` (the top bar's quick create) the caller opens it and no "New post" button shows.
 * `at` (a datetime-local value; the calendar's empty day) adds a date and time field set to it, and the post is made on
 * that date; cleared, or without `at`, the post is made undated as before.
 * `channel`: the format it starts on (a channel calendar's own); without it, a single photo as before.
 */
export function NewPostDialog({ base, canCreate, onCreated, open: openProp, onOpenChange, at, channel: startChannel = "INSTAGRAM_POST" }: { base: string; canCreate: boolean; onCreated: (id: string) => void; open?: boolean; onOpenChange?: (o: boolean) => void; at?: string; channel?: Channel }) {
  const workspaceId = workspaceIdOf(base);
  const brandId = base.split("/brands/")[1];
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [channel, setChannel] = useState<Channel>(startChannel);
  const [goal, setGoal] = useState<ContentGoal>("newArrival");
  const [photo, setPhoto] = useState<LibraryPhoto | null>(null);
  const [direction, setDirection] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One id per opening: a double click or a retry after a dropped answer returns the same post instead of a second one.
  const [requestId, setRequestId] = useState("");
  const controlled = openProp !== undefined;
  const shown = controlled ? openProp : open;

  function reset() {
    setChannel(startChannel);
    setGoal("newArrival");
    setPhoto(null);
    setDirection("");
    setWhen(at ?? "");
    setError("");
    setRequestId(crypto.randomUUID());
  }
  // Opened by the caller: start fresh, as the button does.
  useEffect(() => {
    if (controlled && openProp) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset reads `at` and `startChannel`, listed; it is remade each render
  }, [controlled, openProp, at, startChannel]);

  if (!canCreate || !workspaceId || !brandId) return null;

  function change(next: boolean) {
    if (next) reset();
    if (controlled) onOpenChange?.(next);
    else setOpen(next);
  }

  async function submit() {
    if (!photo || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id } = await request<{ id: string }>(`${base}/content`, {
        method: "POST",
        body: JSON.stringify({ channel, goal, product: { title: photo.title.trim() || "Product", photoKey: photo.key }, ...(direction.trim() ? { direction: direction.trim() } : {}), ...(at && when ? { scheduledFor: new Date(when).toISOString() } : {}), requestId }),
      });
      change(false);
      onCreated(id);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? "You've written 60 posts today. Try again tomorrow." : errorMessage(e, "Couldn't start the post. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {controlled ? null : (
        <Button size="sm" onClick={() => change(true)}>
          <Plus aria-hidden="true" />
          New post
        </Button>
      )}
      <Dialog open={shown} onOpenChange={(o) => !busy && change(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New product post</DialogTitle>
            <DialogDescription>Pick a photo and what the post is for. We&rsquo;ll draft it, then you review it.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <SegmentedRadios label="Format" name="new-post-format" value={channel} onChange={setChannel} options={[{ value: "INSTAGRAM_POST", label: "Single photo" }, { value: "INSTAGRAM_CAROUSEL", label: "Carousel" }]} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Goal
              <select value={goal} onChange={(e) => setGoal(e.target.value as ContentGoal)} className={selectClass}>
                {CONTENT_GOALS.map((g) => <option key={g} value={g}>{CONTENT_GOAL_LABELS[g]}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              Product photo
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed library preview */}
                {photo && <img src={photo.url} alt={photo.title} className="size-14 rounded-md border border-border object-cover" />}
                <Button type="button" size="sm" variant="secondary" onClick={() => setPicking(true)}>
                  {photo ? "Change photo" : "Choose photo"}
                </Button>
              </div>
              {!photo && <p id="photo-required" className="text-xs font-normal text-muted-foreground">Choose a photo to draft the post.</p>}
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <label htmlFor="new-post-direction">
                Direction <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea id="new-post-direction" value={direction} maxLength={DIRECTION_MAX} onChange={(e) => setDirection(e.target.value)} placeholder="Anything the writer should know" aria-describedby="direction-count" />
              <span id="direction-count" className="self-end text-xs font-normal text-muted-foreground">{direction.length}/{DIRECTION_MAX}</span>
            </div>
            {at !== undefined && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Date and time
                <Input type="datetime-local" value={when} min={nowLocalInput()} onChange={(e) => setWhen(e.target.value)} className="h-11 w-fit" />
              </label>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <p className="text-sm text-muted-foreground">Cost: included in your plan</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!photo || busy} aria-describedby={photo ? undefined : "photo-required"} onClick={() => void submit()}>
              {busy && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {busy ? "Drafting…" : "Draft post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LibraryPicker workspaceId={workspaceId} brandId={brandId} open={picking} onOpenChange={setPicking} selectedKey={photo?.key ?? null} canUpload title="Choose the product photo" onUse={setPhoto} />
    </>
  );
}
