"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, RefreshCw } from "lucide-react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { focusSectionHeading, PageSection } from "@/components/ui/page-section";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { errorMessage } from "@/components/settings/api";
import { ConfirmDialog, LoadError } from "@/components/settings/shared";
import { navFor } from "@/lib/nav";
import { libraryPhotos, siteLabel, type LibraryPhoto } from "@/shared";
import { initialSource, libraryApi, photoCount, pickUploads } from "./api";
import { PhotoGrid, SourceSwitch, type Source } from "./photo-grid";
import { BrandLook } from "./brand-look";
import { PhotoFileInput, StatusLines } from "./upload-parts";
import { useBrandLook } from "./use-brand-look";

const EMPTY: Record<Source, { title: string; body: string }> = {
  website: { title: "No website photos", body: "Product photos read from your website appear here. Add your website in onboarding, or upload your own." },
  uploads: { title: "No uploads yet", body: "Photos you upload appear here, and the writers and reels can use them." },
};

type Props = { workspaceId: string; brandId: string; canEdit: boolean; canUpload: boolean };

/** Brand & photos: the website's product photos and the owner's uploads, with the brand look panel on the right. */
export function LibraryBoard({ workspaceId, brandId, canEdit, canUpload }: Props) {
  const { view, failed, reload, set } = useBrandLook(workspaceId, brandId);
  const lib = useMemo(() => libraryPhotos(view), [view]);
  // Null until the owner picks a tab: until then it follows what the library holds.
  const [picked, setPicked] = useState<Source | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!view) {
    return (
      <div className="mx-auto max-w-7xl">
        {failed ? <LoadError message="Couldn't load your brand and photos." onRetry={() => void reload()} /> : <PageSkeleton header={false} />}
      </div>
    );
  }

  const source = picked ?? initialSource(lib);
  const shown = lib[source];
  const busy = uploading || busyKey !== null;

  async function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const { files, errors } = pickUploads(Array.from(input.files ?? []));
    setStatus("");
    setError(errors.join(" "));
    if (files.length === 0) {
      input.value = "";
      return;
    }
    setPicked("uploads");
    setUploading(true);
    let added = 0;
    try {
      for (const [i, file] of files.entries()) {
        setStatus(`Uploading ${i + 1} of ${files.length}…`);
        await libraryApi.upload(workspaceId, brandId, file);
        added += 1;
      }
    } catch (err) {
      // The first refusal (library full, too large) stops the rest: they would be refused the same way.
      setError((prev) => [prev, errorMessage(err)].filter(Boolean).join(" "));
    } finally {
      await reload();
      setStatus(added > 0 ? `Added ${photoCount(added)}.` : "");
      input.value = "";
      setUploading(false);
    }
  }

  async function remove(p: LibraryPhoto) {
    setStatus("");
    setError("");
    setBusyKey(p.key);
    try {
      set(await libraryApi.edit(workspaceId, brandId, { removeUpload: p.key }));
      setStatus(`Removed ${p.title}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      // Flushed first: "Add photos" is disabled while busy, and a disabled button can't take focus.
      flushSync(() => setBusyKey(null));
      // The removed tile's button is gone; land on "Add photos", or on the section heading for a role that can't add.
      if (addRef.current) addRef.current.focus();
      else focusSectionHeading("photos");
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title={navFor("/library").title}
        actions={
          <Button variant="outline" disabled={busy} onClick={() => void reload()}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      >
        Your brand&apos;s colours and tone, and the photos every module draws from. Nothing is published without your approval.
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <PageSection
          id="photos"
          title="Photos"
          description={`${siteLabel(view.website) ?? "Source website"} · ${photoCount(shown.length)}`}
          actions={
            canUpload ? (
              <Button ref={addRef} disabled={busy} onClick={() => fileRef.current?.click()}>
                <ImagePlus aria-hidden="true" />
                Add photos
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Your role can&apos;t add photos.</p>
            )
          }
        >
          <div className="flex flex-col gap-4">
            {canUpload ? (
              <PhotoFileInput ref={fileRef} multiple onChange={addFiles} />
            ) : null}
            <SourceSwitch name="library-source" value={source} counts={{ website: lib.website.length, uploads: lib.uploads.length }} onChange={setPicked} />
            <StatusLines status={status} error={error} />
            <RemovableGrid
              photos={shown}
              label={source === "website" ? "Website photos" : "Uploads"}
              empty={EMPTY[source]}
              onRemove={source === "uploads" && canEdit ? remove : undefined}
              // While a batch uploads, "" holds every remove button disabled (no photo has an empty key).
              busyKey={uploading ? "" : busyKey}
            />
          </div>
        </PageSection>
        <BrandLook workspaceId={workspaceId} brandId={brandId} view={view} canEdit={canEdit} set={set} />
      </div>
    </div>
  );
}

/** Asks before a photo is deleted. The "confirming" state lives here, so opening the dialog re-renders this wrapper but not the memoized grid. */
function RemovableGrid({ onRemove, ...grid }: { photos: LibraryPhoto[]; label: string; empty: { title: string; body: string }; onRemove?: (p: LibraryPhoto) => Promise<void>; busyKey: string | null }) {
  const [confirming, setConfirming] = useState<LibraryPhoto | null>(null);
  return (
    <>
      <PhotoGrid mode="browse" {...grid} onRemove={onRemove ? setConfirming : undefined} />
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title="Delete this photo from the library?"
        description={confirming ? `${confirming.title} is removed from your uploads. This can't be undone.` : ""}
        confirmLabel="Delete photo"
        onConfirm={async () => {
          if (confirming && onRemove) await onRemove(confirming);
        }}
      />
    </>
  );
}
