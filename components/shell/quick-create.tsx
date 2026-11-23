"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { okToDiscard } from "@/components/context/unsaved";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { NoteToTasksDialog } from "@/components/tasks/note-to-tasks-dialog";
import { NewProject } from "@/components/tasks/project-list";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NewPostDialog } from "@/components/workspace/new-post-dialog";
import { postHref, samePage, taskHref } from "@/lib/workspace-view";

type Kind = "task" | "post" | "project" | "note";

/** On a project's page, its id: a task made there starts in that project. */
export function projectIdOf(pathname: string): string | undefined {
  const m = /^\/projects\/([^/]+)$/.exec(pathname);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
}

/** The "+" menu's items, each with the key its server route needs; an item the role can't use isn't offered. */
export function quickCreateItems(perms: readonly string[]): { kind: Kind; label: string }[] {
  const manage = perms.includes("tasks.manage");
  const items: { kind: Kind; label: string; on: boolean }[] = [
    { kind: "task", label: "Task", on: manage },
    { kind: "post", label: "Post from a brief", on: perms.includes("content.create") },
    { kind: "project", label: "Project", on: manage },
    { kind: "note", label: "Tasks from a note", on: manage },
  ];
  return items.filter((i) => i.on).map(({ kind, label }) => ({ kind, label }));
}

/** The top bar's "+" (flag `tasks`): a new task, post, project or tasks from a note on the active business. */
export function QuickCreate({ base, perms }: { base: string; perms: readonly string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [which, setWhich] = useState<Kind | null>(null);
  const items = quickCreateItems(perms);
  if (!items.length) return null;

  const dialog = (k: Kind) => ({ open: which === k, onOpenChange: (o: boolean) => setWhich(o ? k : null) });
  // The new item opens where it lives; leaving this page asks about unsaved work here first.
  const go = (href: string) => {
    if (!samePage(href, pathname) && !okToDiscard()) return;
    router.push(href, { scroll: false });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={tool}>
            <Plus className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">New</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((i) => (
            <DropdownMenuItem key={i.kind} onSelect={() => setWhich(i.kind)}>
              {i.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewTaskDialog base={base} projectId={projectIdOf(pathname)} {...dialog("task")} onCreated={(t) => go(taskHref(pathname, window.location.search, t.id))} />
      <NewPostDialog base={base} canCreate={perms.includes("content.create")} {...dialog("post")} onCreated={(id) => go(postHref(pathname, window.location.search, id))} />
      <Dialog {...dialog("project")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Name it now; its page opens so you can add dates, milestones and tasks.</DialogDescription>
          </DialogHeader>
          <NewProject base={base} onCreated={() => setWhich(null)} />
        </DialogContent>
      </Dialog>
      <NoteToTasksDialog base={base} {...dialog("note")} />
    </>
  );
}
