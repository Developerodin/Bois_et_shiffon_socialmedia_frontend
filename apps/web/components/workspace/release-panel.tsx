"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, CircleAlert, ExternalLink, Send, ShieldCheck, Undo2, X } from "lucide-react";
import { ApiError, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { safeHttpUrl } from "@/lib/website";

type Attempt = {
  id: string;
  status: "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "PENDING_VERIFY" | "CANCELLED";
  provider: string;
  account: string;
  runAt: string;
  publishedAt: string | null;
  externalUrl: string | null;
  error: string | null;
  by: string;
};
type Decision = { id: string; verdict: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; note: string | null; by: string; at: string; current: boolean; version: number | null };
type Release = {
  latestVersion: number | null;
  approvalValid: boolean;
  requirements: { provider: string | null; needsImage: boolean; minImages: number; maxImages: number; needsVideo: boolean; needsBoard: boolean };
  accounts: { id: string; displayName: string }[];
  boards?: Record<string, { id: string; name: string }[] | null>;
  decisions: Decision[];
  attempts: Attempt[];
};

const PROVIDER_NAME: Record<string, string> = { META: "Facebook", INSTAGRAM: "Instagram", THREADS: "Threads", PINTEREST: "Pinterest" };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

/** Approve the exact draft shown above, then publish or schedule it, with a full history. */
export function ReleasePanel({ base, id, status, version, qualityBlocked, perms }: { base: string; id: string; status: string; version: number | null; qualityBlocked: boolean; perms: string[] | null }) {
  const url = `${base}/content/${encodeURIComponent(id)}`;
  const [data, setData] = useState<Release | null>(null);
  const [loadError, setLoadError] = useState(false);
  const load = useCallback(
    () =>
      request<Release>(url).then(
        (d) => {
          setData(d);
          setLoadError(false);
        },
        () => setLoadError(true),
      ),
    [url],
  );

  useEffect(() => void load(), [load]);
  // Follow a post that is going out right now (due within a minute, or up to 10 minutes overdue).
  const busy = data?.attempts.some((a) => {
    const due = new Date(a.runAt).getTime() - Date.now();
    return a.status === "PUBLISHING" || (a.status === "SCHEDULED" && due < 60_000 && due > -10 * 60_000);
  });
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [busy, load]);
  useEffect(() => void load(), [status, version, load]);

  async function act(body: Record<string, unknown>) {
    const next = await request<Release>(url, { method: "POST", body: JSON.stringify(body) });
    setData((d) => ({ ...next, boards: d?.boards }));
    void load();
  }

  if (!data || !perms) {
    return (
      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
        {loadError ? (
          <>
            Couldn&rsquo;t load approval and publishing.
            <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
          </>
        ) : (
          "Loading approval…"
        )}
      </section>
    );
  }
  const canApprove = perms.includes("content.approve");
  const canPublish = perms.includes("publish.execute");

  return (
    <section aria-labelledby="release-h" className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <h2 id="release-h" className="text-sm font-semibold">Approval and publishing</h2>
      {status === "AWAITING_APPROVAL" && version !== null ? (
        canApprove ? (
          <ApproveForm version={version} blocked={qualityBlocked} onDecide={(verdict, note) => act({ action: "decide", version, verdict, note })} />
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for a brand approver to sign off draft v{version}.</p>
        )
      ) : status === "APPROVED" && data.approvalValid ? (
        canPublish ? (
          <PublishForm data={data} version={version!} onPublish={(b) => act({ action: "publish", version, ...b })} />
        ) : (
          <p className="text-sm text-muted-foreground">Approved. Someone who can publish will post it.</p>
        )
      ) : status === "APPROVED" ? (
        <p className="text-sm text-muted-foreground">The approved draft has changed since. The latest version needs a fresh approval.</p>
      ) : status === "DRAFT_REVIEW" || status === "PLANNED" || status === "BRIEF_READY" ? (
        <p className="text-sm text-muted-foreground">
          {qualityBlocked ? "A new draft goes back to the approver once the quality problems are fixed." : "Approval opens once a draft passes the quality check."}
        </p>
      ) : status === "REJECTED" ? (
        <p className="text-sm text-muted-foreground">Rejected. Editing the draft sends it back through review.</p>
      ) : null}
      <History data={data} canPublish={canPublish} onSettle={(attemptId, action) => act({ action, attemptId })} />
    </section>
  );
}

function ApproveForm({ version, blocked, onDecide }: { version: number; blocked: boolean; onDecide: (v: Decision["verdict"], note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Decision["verdict"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  async function run(verdict: Decision["verdict"]) {
    if (verdict !== "APPROVED" && !note.trim()) {
      setError("Write what needs to change, so the team knows what to fix.");
      noteRef.current?.focus();
      return;
    }
    // Rejecting stops the post; ask once more.
    if (verdict === "REJECTED" && !confirmReject) return setConfirmReject(true);
    setConfirmReject(false);
    setPending(verdict);
    setError(null);
    try {
      await onDecide(verdict, note);
      setNote("");
    } catch (e) {
      setError(errText(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          You&rsquo;re signing off <span className="font-medium">draft v{version} exactly as shown above</span>. If anyone edits it later, the new version needs its own approval.
        </span>
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="approval-note" className="text-sm font-medium">
          Note <span className="font-normal text-muted-foreground">(needed to request changes or reject)</span>
        </label>
        <Textarea id="approval-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} rows={2} aria-invalid={Boolean(error)} aria-describedby={error ? "approval-error" : undefined} />
        {error && <p id="approval-error" role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("APPROVED")} disabled={pending !== null || blocked} title={blocked ? "Fix the quality blockers first" : undefined}>
          <Check aria-hidden /> {pending === "APPROVED" ? "Approving…" : `Approve v${version}`}
        </Button>
        <Button variant="outline" onClick={() => run("CHANGES_REQUESTED")} disabled={pending !== null}>
          <Undo2 aria-hidden /> {pending === "CHANGES_REQUESTED" ? "Sending…" : "Request changes"}
        </Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => run("REJECTED")} disabled={pending !== null}>
          <X aria-hidden /> {pending === "REJECTED" ? "Rejecting…" : confirmReject ? "Confirm: reject this post" : "Reject"}
        </Button>
        {confirmReject && pending === null && (
          <Button variant="ghost" onClick={() => setConfirmReject(false)}>
            Keep it
          </Button>
        )}
      </div>
    </div>
  );
}

function PublishForm({ data, version, onPublish }: { data: Release; version: number; onPublish: (b: Record<string, unknown>) => Promise<void> }) {
  const { requirements: req, accounts } = data;
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const boards = data.boards?.[accountId];
  const [boardId, setBoardId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  // Carousels take several links, one per line.
  const imageLinks = imageUrl.split("\n").map((l) => l.trim()).filter(Boolean);
  const many = req.maxImages > 1;
  const [later, setLater] = useState(false);
  const [runAt, setRunAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = PROVIDER_NAME[req.provider ?? ""] ?? "this channel";
  const account = accounts.find((a) => a.id === accountId);
  const image = safeHttpUrl(imageLinks[0] ?? "");
  const allHttps = imageLinks.every((l) => safeHttpUrl(l)?.protocol === "https:");
  const video = safeHttpUrl(videoUrl.trim());

  useEffect(() => {
    if (boards?.length && !boards.some((b) => b.id === boardId)) setBoardId(boards[0].id);
  }, [boards, boardId]);

  if (!req.provider) {
    return <p className="text-sm text-muted-foreground">This format can&rsquo;t be published from here yet. Post it in the app using the approved text above.</p>;
  }
  if (!accounts.length) {
    return (
      <p className="text-sm">
        Approved. Connect a {name} account to publish it.{" "}
        <Link href="/settings?tab=connections" className="font-medium underline underline-offset-2">Open Connections</Link>
      </p>
    );
  }

  const missing =
    (req.needsBoard && !boardId && "Choose a board") ||
    (imageLinks.length < req.minImages && (req.minImages > 1 ? `Add at least ${req.minImages} image links` : "Add an image link")) ||
    (imageLinks.length > req.maxImages && (req.maxImages ? `At most ${req.maxImages} images` : "Reels take a video link, not images")) ||
    (!allHttps && "Image links must start with https://") ||
    (req.needsVideo && video?.protocol !== "https:" && "Add a public https video link") ||
    (later && !runAt && "Pick a date and time") ||
    null;

  async function go() {
    if (!confirming) return setConfirming(true);
    setPending(true);
    setError(null);
    try {
      await onPublish({
        connectionId: accountId,
        ...(req.needsBoard ? { boardId } : {}),
        ...(imageLinks.length ? { imageLinks } : {}),
        ...(req.needsVideo ? { videoUrl: videoUrl.trim() } : {}),
        ...(later ? { runAt: new Date(runAt).toISOString() } : {}),
      });
    } catch (e) {
      setError(errText(e));
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void go(); }} onChange={() => setConfirming(false)}>
      <p className="text-sm text-muted-foreground">Draft v{version} is approved. Choose where and when it goes out.</p>
      {accounts.length > 1 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{name} account</legend>
          {accounts.map((a) => (
            <label key={a.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="account" value={a.id} checked={accountId === a.id} onChange={() => setAccountId(a.id)} className="size-4 accent-primary" />
              {a.displayName}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm">Posting as <span className="font-medium">{accounts[0].displayName}</span> on {name}</p>
      )}

      {req.needsBoard && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pub-board" className="text-sm font-medium">Board</label>
          {boards === undefined ? (
            <p className="text-sm text-muted-foreground">Loading boards…</p>
          ) : boards === null ? (
            <p className="text-sm text-destructive">Couldn&rsquo;t load boards from Pinterest. Reconnect the account and try again.</p>
          ) : boards.length === 0 ? (
            <p className="text-sm text-muted-foreground">This account has no boards yet. Create one on Pinterest, then reopen this post.</p>
          ) : (
            <select id="pub-board" value={boardId} onChange={(e) => setBoardId(e.target.value)} className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
      )}

      {req.needsVideo && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pub-video" className="text-sm font-medium">Video link</label>
          <Input id="pub-video" type="url" inputMode="url" placeholder="https://…/reel.mp4" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="h-11" aria-describedby="pub-video-help" />
          <p id="pub-video-help" className="text-xs text-muted-foreground">A public https link to an MP4 (vertical, 3 to 90 seconds). Instagram downloads it from there.</p>
        </div>
      )}
      {req.maxImages > 0 && (
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pub-image" className="text-sm font-medium">
          {many ? `Image links (${req.minImages} to ${req.maxImages}, one per line)` : "Image link"} {!req.needsImage && <span className="font-normal text-muted-foreground">(optional)</span>}
        </label>
        <div className="flex items-center gap-3">
          {many ? (
            <Textarea id="pub-image" rows={4} placeholder={"https://…/slide-1.jpg\nhttps://…/slide-2.jpg"} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} aria-describedby="pub-image-help" />
          ) : (
          <Input id="pub-image" type="url" inputMode="url" placeholder="https://…/photo.jpg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="h-11" aria-describedby="pub-image-help" />
          )}
          {image?.protocol === "https:" && (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied preview from any host
            <img src={image.href} alt="" className="size-11 shrink-0 rounded-md border border-border object-cover" />
          )}
        </div>
        <p id="pub-image-help" className="text-xs text-muted-foreground">Public https link{many ? "s" : ""} to {req.provider === "INSTAGRAM" ? "JPG" : "JPG or PNG"} images. {name} downloads them from there.</p>
      </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">When</legend>
        <div role="radiogroup" className="flex w-fit rounded-lg bg-muted p-0.5 text-sm">
          {([false, true] as const).map((l) => (
            <button key={String(l)} type="button" role="radio" aria-checked={later === l} onClick={() => { setLater(l); setConfirming(false); }} className={cn("min-h-9 rounded-md px-3", later === l ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground")}>
              {l ? "Schedule" : "Now"}
            </button>
          ))}
        </div>
        {later && (
          <Input type="datetime-local" aria-label="Publish date and time" value={runAt} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} onChange={(e) => setRunAt(e.target.value)} className="h-11 w-fit" />
        )}
      </fieldset>

      {error && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || Boolean(missing)}>
          {later ? <CalendarClock aria-hidden /> : <Send aria-hidden />}
          {pending ? (later ? "Scheduling…" : "Publishing…") : confirming ? (later ? `Confirm: schedule for ${account?.displayName}` : `Confirm: post to ${account?.displayName} now`) : later ? "Schedule" : "Publish now"}
        </Button>
        {confirming && !pending && <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>}
        {missing && <span className="text-xs text-muted-foreground">{missing}</span>}
      </div>
    </form>
  );
}

const ATTEMPT: Record<Attempt["status"], { label: string; tone: string }> = {
  SCHEDULED: { label: "Scheduled", tone: "bg-primary/15 text-primary" },
  PUBLISHING: { label: "Publishing…", tone: "bg-primary/15 text-primary" },
  PUBLISHED: { label: "Published", tone: "bg-success/15 text-success" },
  FAILED: { label: "Not posted", tone: "bg-destructive/15 text-destructive" },
  PENDING_VERIFY: { label: "Check needed", tone: "bg-warning/15 text-warning" },
  CANCELLED: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
};
const VERDICT: Record<Decision["verdict"], string> = { APPROVED: "approved", CHANGES_REQUESTED: "asked for changes to", REJECTED: "rejected" };

function History({ data, canPublish, onSettle }: { data: Release; canPublish: boolean; onSettle: (attemptId: string, action: "cancel" | "posted" | "not-posted") => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const rows = [
    ...data.decisions.map((d) => ({ at: d.at, key: d.id, d, a: null as Attempt | null })),
    ...data.attempts.map((a) => ({ at: a.publishedAt ?? a.runAt, key: a.id, d: null as Decision | null, a })),
  ].sort((x, y) => +new Date(y.at) - +new Date(x.at));
  if (!rows.length) return null;

  async function settle(id: string, action: "cancel" | "posted" | "not-posted") {
    setPending(id + action);
    setError(null);
    try {
      await onSettle(id, action);
    } catch (e) {
      setError(errText(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <ol className="mt-2 flex flex-col divide-y divide-border">
        {rows.map(({ key, d, a }) =>
          d ? (
            <li key={key} className="flex flex-col gap-0.5 py-2.5 text-sm">
              <span>
                <span className="font-medium">{d.by}</span> {VERDICT[d.verdict]} {d.version ? `v${d.version}` : "an earlier draft"}
                <span className="text-muted-foreground"> · {when(d.at)}</span>
                {d.verdict === "APPROVED" && !d.current && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">no longer valid</span>}
              </span>
              {d.note && <span className="text-muted-foreground">&ldquo;{d.note}&rdquo;</span>}
            </li>
          ) : a ? (
            <li key={key} className="flex flex-col gap-1.5 py-2.5 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ATTEMPT[a.status].tone)}>{ATTEMPT[a.status].label}</span>
                <span>
                  {PROVIDER_NAME[a.provider] ?? a.provider} · {a.account}
                  <span className="text-muted-foreground"> · {a.status === "PUBLISHED" && a.publishedAt ? when(a.publishedAt) : when(a.runAt)} · by {a.by}</span>
                </span>
                {a.status === "PUBLISHED" && safeHttpUrl(a.externalUrl) && (
                  <a href={safeHttpUrl(a.externalUrl)!.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                    View post <ExternalLink aria-hidden className="size-3" />
                  </a>
                )}
              </span>
              {a.error && a.status !== "PUBLISHED" && <span className="text-muted-foreground">{a.error}</span>}
              {canPublish && a.status === "SCHEDULED" && (
                <span>
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => settle(a.id, "cancel")}>
                    {pending === a.id + "cancel" ? "Cancelling…" : "Cancel"}
                  </Button>
                </span>
              )}
              {canPublish && a.status === "PENDING_VERIFY" && (
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => settle(a.id, "posted")}>It&rsquo;s live</Button>
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => settle(a.id, "not-posted")}>It didn&rsquo;t post</Button>
                </span>
              )}
            </li>
          ) : null,
        )}
      </ol>
    </div>
  );
}
