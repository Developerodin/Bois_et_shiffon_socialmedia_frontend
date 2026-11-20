"use client";

import { useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { LibraryPicker } from "@/components/library/library-picker";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { Textarea } from "@/components/ui/textarea";
import { workspaceIdOf } from "@/lib/plan-credits";
import { CONTENT_GOALS, CONTENT_GOAL_LABELS, type ContentGoal, type LibraryPhoto } from "@/shared";

type Channel = "INSTAGRAM_POST" | "INSTAGRAM_CAROUSEL";
const DIRECTION_MAX = 500;

/** "New post" for people who can create content: a product photo, a goal and a note, then the Creator drafts it and it opens. */
export function NewPostDialog({ base, canCreate, onCreated }: { base: string; canCreate: boolean; onCreated: (id: string) => void }) {
  const workspaceId = workspaceIdOf(base);
  const brandId = base.split("/brands/")[1];
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [channel, setChannel] = useState<Channel>("INSTAGRAM_POST");
  const [goal, setGoal] = useState<ContentGoal>("newArrival");
  const [photo, setPhoto] = useState<LibraryPhoto | null>(null);
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One id per opening: a double click or a retry after a dropped answer returns the same post instead of a second one.
  const [requestId, setRequestId] = useState("");

  if (!canCreate || !workspaceId || !brandId) return null;

  function change(next: boolean) {
    if (next) {
      setChannel("INSTAGRAM_POST");
      setGoal("newArrival");
      setPhoto(null);
      setDirection("");
      setError("");
      setRequestId(crypto.randomUUID());
    }
    setOpen(next);
  }

  async function submit() {
    if (!photo || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id } = await request<{ id: string }>(`${base}/content`, {
        method: "POST",
        body: JSON.stringify({ channel, goal, product: { title: photo.title.trim() || "Product", photoKey: photo.key }, ...(direction.trim() ? { direction: direction.trim() } : {}), requestId }),
      });
      setOpen(false);
      onCreated(id);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? "You've written 60 posts today. Try again tomorrow." : errorMessage(e, "Couldn't start the post. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => change(true)}>
        <Plus aria-hidden="true" />
        New post
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && change(o)}>
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
                <Button type="button" size="sm" variant="secondary" onClick={() => setPicking(true)} aria-required={!photo} aria-describedby={photo ? undefined : "photo-required"}>
                  {photo ? "Change photo" : "Choose photo"}
                </Button>
              </div>
              {!photo && <p id="photo-required" className="text-xs font-normal text-muted-foreground">Choose a photo to draft the post.</p>}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Direction <span className="font-normal text-muted-foreground">(optional)</span>
              <Textarea value={direction} maxLength={DIRECTION_MAX} onChange={(e) => setDirection(e.target.value)} placeholder="Anything the writer should know" />
              <span className="self-end text-xs font-normal text-muted-foreground">{direction.length}/{DIRECTION_MAX}</span>
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <p className="text-sm text-muted-foreground">Cost: included in your plan</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => change(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!photo || busy} onClick={() => void submit()}>
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
