"use client";

import { useEffect, useState } from "react";
import type { ReelSummary } from "@/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/components/settings/api";
import { reelsApi } from "./api";

/** "Posted it? Add link": the address of a reel posted by hand, so its results can be followed. Shown for `reel`; null is closed. */
export function PostLinkDialog({ workspaceId, brandId, reel, onClose, onSaved }: {
  workspaceId: string;
  brandId: string;
  reel: ReelSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = reel?.id;
  useEffect(() => {
    setUrl("");
    setError(null);
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!reel || saving || !url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await reelsApi.registerLink(workspaceId, brandId, reel.id, url.trim());
      onSaved();
      onClose();
    } catch (err) {
      // The server's sentence ("…Instagram post", "Download the reel first").
      setError(errorMessage(err, "Couldn't save the link. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={reel !== null} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add the post link</DialogTitle>
            <DialogDescription>Paste the link of the reel you posted on Instagram, so its results can be followed.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="post-link" className="text-sm font-medium">Post link</label>
            <Input id="post-link" type="url" inputMode="url" autoComplete="off" className="rounded-xl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
          </div>
          <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !url.trim()}>{saving ? "Saving…" : "Save link"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
