"use client";

import { useId, useState } from "react";
import { Upload, X } from "lucide-react";
import type { TaskAttachmentDto, TaskDetailDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { tasksApi } from "@/lib/tasks-api";

export const ROLE_LABEL: Record<string, string> = { BEFORE: "Before", AFTER: "After", OTHER: "Photo" };

const PHOTO_TYPES = ["image/jpeg", "image/png"];

/**
 * A task's screenshots for the given roles: one slot per role (Before, After) with an upload control, or a grid of the
 * others. Each photo opens full size in a new tab. `canEdit` (the owner with content.create, or tasks.manage) only hides
 * the upload and remove controls; the server decides, and its refusal shows as text.
 */
export function TaskAttachments({ base, task, roles, canEdit, slots }: { base: string; task: TaskDetailDto; roles: string[]; canEdit: boolean; slots?: boolean }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  // The person's own say that they may use the photo; nothing uploads until it's ticked.
  const [rights, setRights] = useState(false);
  const inputId = useId();
  const photos = task.attachments.filter((a) => roles.includes(a.role));
  if (!slots && !photos.length) return null;

  const remove = async (a: TaskAttachmentDto) => {
    setBusyId(a.id);
    setError("");
    try {
      await tasksApi.removeAttachment(base, task.id, a.id);
    } catch (e) {
      setError(errorMessage(e, "Couldn't remove the screenshot. Try again."));
    } finally {
      setBusyId(null);
    }
  };

  const upload = async (role: "BEFORE" | "AFTER", file: File | undefined) => {
    if (!file || !rights) return;
    setError("");
    if (!PHOTO_TYPES.includes(file.type)) return setError("Screenshots can be JPG or PNG.");
    setUploading(role);
    try {
      await tasksApi.uploadScreenshot(base, task.id, file, role, rights);
    } catch (e) {
      setError(errorMessage(e, "Couldn't upload the photo. Try again."));
    } finally {
      setUploading(null);
    }
  };

  const uploadOff = !!uploading || !rights;
  const uploader = (role: "BEFORE" | "AFTER") => (
    <label
      htmlFor={`${inputId}-${role}`}
      aria-disabled={uploadOff || undefined}
      className="inline-flex h-8 cursor-pointer items-center gap-2 self-start rounded-full border border-input px-3 text-xs font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 pointer-coarse:h-11"
    >
      <Upload className="size-4" aria-hidden="true" />
      {uploading === role ? "Uploading…" : `Upload ${ROLE_LABEL[role].toLowerCase()} screenshot`}
      <input
        id={`${inputId}-${role}`}
        type="file"
        accept={PHOTO_TYPES.join(",")}
        className="sr-only"
        disabled={uploadOff}
        aria-describedby={!rights ? `${inputId}-why` : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void upload(role, f);
        }}
      />
    </label>
  );

  const tile = (a: TaskAttachmentDto) => (
    <figure key={a.id} className="relative overflow-hidden rounded-xl border border-border bg-muted">
      {/* A signed link, valid for an hour; the peek reads the task again on any change, which renews it. */}
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an optimisable asset */}
        <img src={a.url} alt={`${ROLE_LABEL[a.role] ?? "Photo"} screenshot`} className="aspect-video w-full object-cover" />
      </a>
      {canEdit ? (
        <button
          type="button"
          disabled={busyId === a.id}
          onClick={() => void remove(a)}
          className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-coarse:size-11"
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Remove {ROLE_LABEL[a.role] ?? "photo"} screenshot</span>
        </button>
      ) : null}
    </figure>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        {slots
          ? roles.map((role) => {
              const inRole = photos.filter((a) => a.role === role);
              return (
                <div key={role} className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{ROLE_LABEL[role] ?? role}</p>
                  {inRole.length ? inRole.map(tile) : <p className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border px-2 text-center text-xs text-muted-foreground">No screenshot yet</p>}
                  {canEdit && (role === "BEFORE" || role === "AFTER") ? uploader(role) : null}
                </div>
              );
            })
          : photos.map(tile)}
      </div>
      {slots && canEdit ? (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
            <input type="checkbox" className="size-4 accent-primary" checked={rights} disabled={!!uploading} onChange={(e) => setRights(e.target.checked)} />
            I have the right to use this photo
          </label>
          <p id={`${inputId}-why`} className="text-xs text-muted-foreground">
            {rights ? "JPG or PNG, up to 15 MB." : "Tick “I have the right to use this photo” to upload. JPG or PNG, up to 15 MB."}
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
