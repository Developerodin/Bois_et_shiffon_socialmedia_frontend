"use client";

import { useId, useState } from "react";
import { Download, FileText, Upload, X } from "lucide-react";
import { TASK_FILE_MAX_BYTES, TASK_FILE_TYPES, TASK_FILES_MAX, taskFileType, type TaskAttachmentDto, type TaskDetailDto, type TaskFileDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { FILE_TYPES_HINT, tasksApi } from "@/lib/tasks-api";

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

const FILE_ACCEPT = Object.values(TASK_FILE_TYPES)
  .map((t) => `.${t.ext}`)
  .concat(".jpeg")
  .join(",");

/** "840 KB", "2.4 MB". */
export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A task's documents: name, type and size, a Download link (the server's signed link always downloads, under a plain
 * name, and is never shown inline), and for `canEdit` (staff who may edit the task: its owner or tasks.manage) Upload
 * and Remove. Staff are told when a client reviewer can see the task, since the client can download these files too.
 * The name is the person's own: shown as text only.
 */
export function TaskFiles({ base, task, canEdit }: { base: string; task: TaskDetailDto; canEdit: boolean }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  // Older servers send no files.
  const files = task.files ?? [];
  if (!files.length && !canEdit) return null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!taskFileType(file.name)) return setError(FILE_TYPES_HINT);
    if (file.size > TASK_FILE_MAX_BYTES) return setError(`That file is too large (up to ${TASK_FILE_MAX_BYTES / (1024 * 1024)} MB).`);
    setUploading(true);
    try {
      await tasksApi.uploadFile(base, task.id, file);
    } catch (e) {
      setError(errorMessage(e, "Couldn't upload the file. Try again."));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (f: TaskFileDto) => {
    setBusyId(f.id);
    setError("");
    try {
      await tasksApi.removeFile(base, task.id, f.id);
    } catch (e) {
      setError(errorMessage(e, "Couldn't remove the file. Try again."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby={`${inputId}-head`} className="flex flex-col gap-2">
      <h3 id={`${inputId}-head`} className="text-sm font-medium">
        Files
      </h3>
      {files.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {files.map((f) => {
            const label = TASK_FILE_TYPES[f.contentType as keyof typeof TASK_FILE_TYPES]?.label ?? "File";
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm" title={f.fileName}>
                    {f.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {label} · {fileSize(f.bytes)}
                  </span>
                </span>
                {/* A signed link, valid for an hour, sent as a download; the peek reads the task again on any change, which renews it. */}
                <a href={f.url} download rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11">
                  <Download className="size-4" aria-hidden="true" />
                  Download<span className="sr-only"> {f.fileName}</span>
                </a>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busyId === f.id}
                    onClick={() => void remove(f)}
                    className="flex size-8 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-coarse:size-11"
                  >
                    <X className="size-4" aria-hidden="true" />
                    <span className="sr-only">Remove {f.fileName}</span>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {canEdit ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={inputId}
            aria-disabled={uploading || files.length >= TASK_FILES_MAX || undefined}
            className="inline-flex h-8 cursor-pointer items-center gap-2 self-start rounded-full border border-input px-3 text-xs font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 pointer-coarse:h-11"
          >
            <Upload className="size-4" aria-hidden="true" />
            {uploading ? "Uploading…" : "Upload file"}
            <input
              id={inputId}
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              disabled={uploading || files.length >= TASK_FILES_MAX}
              aria-describedby={`${inputId}-hint`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                void upload(f);
              }}
            />
          </label>
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            PDF, Word, Excel, PowerPoint, CSV, text, JPG or PNG, up to {TASK_FILE_MAX_BYTES / (1024 * 1024)} MB. {files.length >= TASK_FILES_MAX ? `A task holds up to ${TASK_FILES_MAX} files.` : ""}
          </p>
        </div>
      ) : null}
      {task.clientVisible && !task.viewerIsClient && (files.length || canEdit) ? (
        <p className="text-xs text-muted-foreground">A client reviewer can see this task and download these files.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
