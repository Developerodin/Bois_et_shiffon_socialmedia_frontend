"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import type { NotificationDto } from "@/shared";
import { setActiveContext } from "@/components/context/api";
import { okToDiscard } from "@/components/context/unsaved";
import { errorMessage } from "@/components/settings/api";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { JOB_INTERVALS } from "@/components/workspace/use-job";
import { urlHistoryHref } from "@/lib/seo-links";
import { listsCare, notificationsApi, onTasksChanged } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";
import { navigate, samePage, taskHref } from "@/lib/workspace-view";

/** The server counts unread up to 100; past 99 the badge says so instead of a number it doesn't know. */
const CAP = 100;
const POLL_MS = JOB_INTERVALS.tasks[0][1];

/** The badge's text: null (no badge) at 0, "99+" at the server's cap. */
export function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count >= CAP ? "99+" : String(count);
}

export function BellBadge({ count }: { count: number }) {
  const label = badgeLabel(count);
  if (!label) return null;
  return (
    <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-semibold leading-5 text-primary-foreground">
      {label}
    </span>
  );
}

/** What happened, in words. The task's title shows beside it as text (never as HTML). A group says how many. */
export function notificationText(n: NotificationDto): string {
  const who = n.actor ? n.actor.name : "Someone";
  const c = n.count;
  if (c > 1) {
    switch (n.kind) {
      case "TASK_ASSIGNED":
        return `${c} tasks assigned to you`;
      case "REVIEW_REQUESTED":
        return `${c} tasks waiting for your review`;
      case "TASK_OVERDUE":
        return `${c} of your tasks are overdue`;
      case "TASK_RECHECK":
        return `${c} tasks to recheck`;
      case "TASK_APPROVED":
        return `${c} of your tasks were approved`;
      case "TASK_CHANGES_REQUESTED":
        return `Changes asked for on ${c} of your tasks`;
      case "AD_ALERT":
        return `${c} ads alerts`;
      case "SEO_ALERT":
        return `${c} search traffic alerts`;
      default:
        return `${c} task updates`;
    }
  }
  switch (n.kind) {
    case "TASK_ASSIGNED":
      return `${who} assigned you a task`;
    case "REVIEW_REQUESTED":
      return `${who} asked you to review a task`;
    case "TASK_OVERDUE":
      return "A task of yours is overdue";
    case "TASK_RECHECK":
      return "Time to recheck a task";
    case "TASK_APPROVED":
      return `${who} approved your task`;
    case "TASK_CHANGES_REQUESTED":
      return `${who} asked for changes to your task`;
    case "AD_ALERT":
      // Written and cleaned on the server (one line, no control or bidi characters); shown as text, never as HTML.
      return n.alert?.text ?? "Ads alert";
    case "SEO_ALERT":
      // Server text too ("3 pages losing search traffic, e.g. /a"), shown as text.
      return n.alert?.text ?? "Pages losing search traffic";
    default:
      return "A task changed";
  }
}

/**
 * Where a notice opens, or null when it has nowhere to go: an ads alert (one or a group) opens the Ads tab; a search
 * traffic alert opens its page's URL history (the server-built `seoUrl`), or the Search tab for a group or the whole
 * site, only with the `data` flag (`opts.data`; else nowhere); a task group the list it is about; a single task notice
 * its task (the caller places it in this page's peek when it can).
 */
export function notificationTarget(n: NotificationDto, opts: { data?: boolean } = {}): string | null {
  if (n.kind === "AD_ALERT") return "/performance?tab=ads";
  if (n.kind === "SEO_ALERT") {
    if (!opts.data) return null;
    return n.count === 1 && n.alert?.seoUrl ? urlHistoryHref(n.alert.seoUrl) : "/performance?tab=search";
  }
  if (!n.taskId) return null;
  return n.count > 1 ? `/tasks?view=${groupView(n.kind)}` : `/tasks?task=${encodeURIComponent(n.taskId)}`;
}

/** The task list a group of notices opens: review requests go to Approvals, the rest to My tasks (overdue to Overdue). */
export const groupView = (kind: string) => (kind === "REVIEW_REQUESTED" ? "approvals" : kind === "TASK_OVERDUE" ? "overdue" : "mine");

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The top bar's bell (flag `tasks`): unread count polled every minute while the tab is visible, again when it is shown
 * and after any task change here; the menu lists the latest 20 with "Mark all read". Opening one opens its task, switching
 * business first (asking about unsaved work) when it belongs to another one.
 * ponytail: only the first 20 are listed; older ones stay reachable through the task lists.
 */
export function NotificationBell({ workspaceId, brandId, dataOn = false }: { workspaceId: string; brandId: string | null; dataOn?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationDto[] | null>(null);
  const [listError, setListError] = useState("");

  const refresh = useCallback(() => {
    notificationsApi.count(workspaceId).then(setCount, () => {
      // keep the last count: the next poll tries again
    });
  }, [workspaceId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => document.visibilityState === "visible";
    const loop = () => {
      clearTimeout(timer);
      if (!visible()) return;
      refresh();
      timer = setTimeout(loop, POLL_MS);
    };
    loop();
    // Shown again, or a task changed here (an action may have assigned or reviewed one): count now. Not on focus too:
    // switching back to the tab fires both, and one count is enough.
    document.addEventListener("visibilitychange", loop);
    const off = onTasksChanged((d) => listsCare(d) && loop());
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", loop);
      off();
    };
  }, [refresh]);

  const load = () => {
    setListError("");
    notificationsApi.page(workspaceId).then(
      (p) => setList(p.notifications),
      (e) => setListError(errorMessage(e, "Couldn't load your notifications. Try again.")),
    );
  };

  const markAll = async () => {
    try {
      await notificationsApi.read(workspaceId, { all: true });
      const at = new Date().toISOString();
      setList((l) => l?.map((n) => ({ ...n, readAt: n.readAt ?? at })) ?? l);
      setCount(0);
    } catch (e) {
      toast({ title: "Couldn't mark them read", detail: errorMessage(e, "Try again."), tone: "warning" });
    }
  };

  const openOne = async (n: NotificationDto) => {
    const group = n.count > 1;
    if (!n.readAt) {
      // Fire and forget: opening the task matters more than the badge, which the next poll corrects.
      const which = group ? { group: { kind: n.kind, brandId: n.brandId, upTo: n.createdAt } } : { ids: [n.id] };
      void notificationsApi.read(workspaceId, which).then(refresh, () => undefined);
      setList((l) => l?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? l);
    }
    const target = notificationTarget(n, { data: dataOn });
    if (!target) return;
    if (n.brandId !== brandId) {
      // Another business: the same guard the business switcher uses, then its /tasks page opens the task or list.
      if (!okToDiscard()) return;
      try {
        await setActiveContext({ workspaceId, brandId: n.brandId });
      } catch {
        return toast({ title: "Couldn't switch business", detail: "Try again.", tone: "warning" });
      }
      router.push(target);
      router.refresh();
      return;
    }
    const href = group || !n.taskId ? target : taskHref(pathname, window.location.search, n.taskId);
    // Leaving this page for /tasks: ask about unsaved work here (a page with a peek asks itself when its URL changes).
    if (!samePage(href, pathname) && !okToDiscard()) return;
    navigate(router, href, pathname);
  };

  const label = badgeLabel(count);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label ? `Notifications, ${label} unread` : "Notifications"} className={cn(tool, "relative px-2.5")}>
          <Bell className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
          <BellBadge count={count} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {/* A menu item, so the arrow keys reach it; the menu stays open to show them read. */}
        {list?.some((n) => !n.readAt) ? (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void markAll();
            }}
          >
            Mark all read
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {listError ? (
          <p role="alert" className="px-2 py-3 text-sm text-destructive">
            {listError}
          </p>
        ) : list === null ? (
          <p role="status" className="px-2 py-3 text-sm text-muted-foreground">
            Loading…
          </p>
        ) : list.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nothing new. Task updates and ads alerts show here.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            {list.map((n) => (
              <DropdownMenuItem key={n.id} onSelect={() => void openOne(n)} className="flex flex-col items-start gap-0.5 py-2">
                <span className="flex w-full items-center gap-2 text-sm">
                  {!n.readAt ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" /> : null}
                  <span className={cn("min-w-0 flex-1", !n.readAt && "font-medium")}>
                    {!n.readAt ? <span className="sr-only">Unread: </span> : null}
                    {notificationText(n)}
                  </span>
                </span>
                {n.taskTitle && n.count === 1 ? <span className="line-clamp-2 text-sm text-muted-foreground">{n.taskTitle}</span> : null}
                <span className="text-xs text-muted-foreground">{when(n.createdAt)}</span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
