"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { TaskAttachmentDto, TaskDetailDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { tasksApi } from "@/lib/tasks-api";
import { TASKS_CHANGED } from "@/components/tasks/task-views";

export const ROLE_LABEL: Record<string, string> = { BEFORE: "Before", AFTER: "After", OTHER: "Photo" };

/**
 * A task's screenshots for the given roles: one slot per role (Before, After), or a grid of the others. Each photo
 * opens full size in a new tab and can be taken off the task by people the server allows (`canEdit` only hides the button).
 * ponytail: no upload here yet. Attaching needs a VERIFIED MediaUpload id, and the web's library upload
 * (libraryApi.upload) stores a file without one; add the upload once the server's media route returns that id.
 */
export function TaskAttachments({ base, task, roles, canEdit, slots }: { base: string; task: TaskDetailDto; roles: string[]; canEdit: boolean; slots?: boolean }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
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
      window.dispatchEvent(new Event(TASKS_CHANGED));
    }
  };

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
                </div>
              );
            })
          : photos.map(tile)}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
