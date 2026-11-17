"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/components/settings/api";
import { ListSkeleton, LoadError } from "@/components/settings/shared";
import { libraryPhotos, siteLabel } from "@/shared";
import { initialSource, libraryApi, pickUploads } from "./api";
import { PhotoGrid, SourceSwitch, type Source } from "./photo-grid";
import { useBrandLook } from "./use-brand-look";

const EMPTY: Record<Source, { title: string; body: string }> = {
  website: { title: "No photos", body: "No product photos from your website yet. Upload one instead." },
  uploads: { title: "No uploads", body: "No uploads yet. Use Upload new to add one." },
};

type Props = {
  workspaceId: string;
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedKey?: string | null;
  canUpload: boolean;
  title?: string;
  /** Called with the chosen photo's key; the dialog closes after. */
  onUse: (key: string) => void;
  children?: ReactNode;
};

/** Pick one photo from the brand's library (website photos or uploads), or upload a new one in place. */
export function LibraryPicker({ open, onOpenChange, children, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The body mounts with the dialog, so every opening starts from the passed selection. */}
      <DialogContent className="max-w-3xl">
        <PickerBody onOpenChange={onOpenChange} {...rest}>
          {children}
        </PickerBody>
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ workspaceId, brandId, onOpenChange, selectedKey = null, canUpload, title = "Choose a photo", onUse, children }: Omit<Props, "open">) {
  const { view, failed, reload } = useBrandLook(workspaceId, brandId);
  const lib = useMemo(() => libraryPhotos(view), [view]);
  // Null until the owner picks a tab or uploads: until then it follows the selection and what the library holds.
  const [picked, setPicked] = useState<Source | null>(null);
  const [selected, setSelected] = useState<string | null>(selectedKey);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const source = picked ?? initialSource(lib, selectedKey ?? undefined);
  const chosen = [...lib.website, ...lib.uploads].find((p) => p.key === selected);

  async function addFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const { files, errors } = pickUploads(Array.from(input.files ?? []).slice(0, 1));
    setStatus("");
    setError(errors.join(" "));
    if (files.length === 0) {
      input.value = "";
      return;
    }
    setUploading(true);
    setStatus("Uploading…");
    try {
      const { key } = await libraryApi.upload(workspaceId, brandId, files[0]);
      await reload();
      setPicked("uploads");
      // Kept even if the reloaded view lacks it yet: the choice shows once the view has it.
      setSelected(key);
      setStatus("Added 1 photo.");
    } catch (err) {
      setStatus("");
      setError(errorMessage(err));
    } finally {
      input.value = "";
      setUploading(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>From your website or your uploads.</DialogDescription>
          </div>
          {canUpload ? (
            <>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={addFile} />
              <Button variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden="true" />
                Upload new
              </Button>
            </>
          ) : null}
        </div>
        {/* Always mounted so screen readers hear each change; empty lines take no height. */}
        <div>
          <p aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
          <p role="alert" className="text-sm text-destructive">{error}</p>
        </div>
      </DialogHeader>

      {!view ? (
        failed ? <LoadError message="Couldn't load your photos." onRetry={() => void reload()} /> : <ListSkeleton label="Loading photos" />
      ) : (
        <div className="flex flex-col gap-4">
          <SourceSwitch name="picker-source" value={source} counts={{ website: lib.website.length, uploads: lib.uploads.length }} onChange={setPicked} />
          {source === "website" && view.website ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{view.name} · Website</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{siteLabel(view.website)}</span>
            </p>
          ) : null}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            <PhotoGrid
              mode="pick"
              name="picker-photo"
              label="Photos"
              photos={lib[source]}
              empty={EMPTY[source]}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
          {children}
        </div>
      )}

      <DialogFooter className="items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{chosen ? chosen.title : "No photo selected"}</p>
          <p className="text-muted-foreground">{selected ? "1 photo selected" : "Select a photo"}</p>
        </div>
        <Button
          disabled={!selected || uploading}
          onClick={() => {
            if (!selected) return;
            onUse(selected);
            onOpenChange(false);
          }}
        >
          Use photo
          <ArrowRight aria-hidden="true" />
        </Button>
      </DialogFooter>
    </>
  );
}
