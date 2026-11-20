"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, CircleAlert, Download, ExternalLink, ImageUp, Send, ShieldCheck, Undo2, X } from "lucide-react";
import { ApiError, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { publishCalls } from "@/components/workspace/release";
import { downloadFile } from "@/lib/download";
import { dayTime, nowLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { BY_HAND_STEPS, safeHttpUrl, zoneCity } from "@/shared";

type Attempt = {
  id: string;
  status: "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "PARTIAL" | "FAILED" | "PENDING_VERIFY" | "CANCELLED";
  provider: string;
  account: string;
  runAt: string;
  publishedAt: string | null;
  externalUrl: string | null;
  error: string | null;
  by: string;
  /** A story attempt: how many frames it has and which are out (0-based `i`). */
  frames?: number;
  progress?: { i: number; state: "publishing" | "published" | "not-posted" }[];
};
type Decision = { id: string; verdict: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; note: string | null; by: string; byClient?: boolean; at: string; current: boolean; version: number | null; override: string[] | null };
/** A gate issue: a linked product (availability, price) or the post's offer. `overridable`: "Approve anyway" can cover it. */
type ProductIssue = { productId?: string; campaignId?: string; kind: "availability" | "price" | "offer"; message: string; refuses: boolean; overridable: boolean };
/** The post's campaign; times are brand wall-clock strings, `ends` null for a standing priority. */
type Campaign = { kind: "offer" | "campaign" | "priority"; name: string; offer: string | null; discountPercent: number | null; code: string | null; starts: string; ends: string | null; timeZone: string; withdrawn: boolean };
type Release = {
  latestVersion: number | null;
  approvalValid: boolean;
  /** `studio`: a reel made in the app; it posts its own video, so no link is asked. An older server sends none. */
  requirements: { provider: string | null; needsImage: boolean; minImages: number; maxImages: number; needsVideo: boolean; needsBoard: boolean; frames?: [number, number]; studio?: boolean };
  /** A story marked to be posted by hand, and when it is due. */
  byHand?: boolean;
  scheduledFor?: string | null;
  /** The link of a post someone posted by hand, once recorded. An older server sends none. */
  postUrl?: string | null;
  accounts: { id: string; displayName: string }[];
  boards?: Record<string, { id: string; name: string }[] | null>;
  decisions: Decision[];
  attempts: Attempt[];
  productIssues: ProductIssue[];
  campaign: Campaign | null;
};

const PROVIDER_NAME: Record<string, string> = { META: "Facebook", INSTAGRAM: "Instagram", THREADS: "Threads", PINTEREST: "Pinterest" };
const CAMPAIGN_KIND = { offer: "Offer", campaign: "Campaign", priority: "Priority" } as const;
/** "Offer: Black Friday · -20 % · 2026-11-27 08:00 – 2026-11-30 20:00 (Paris)" or "Priority: Oak dining". */
function campaignLine(c: Campaign) {
  const head = `${CAMPAIGN_KIND[c.kind]}: ${c.name}`;
  if (c.withdrawn) return `${head} (withdrawn)`;
  return [head, c.discountPercent ? `-${c.discountPercent} %` : null, c.code, c.ends ? `${c.starts} – ${c.ends} (${zoneCity(c.timeZone)})` : null].filter(Boolean).join(" · ");
}
const asRelease = (d: Release) => d;
/** Follow a post that is going out right now (due within a minute, or up to 10 minutes overdue) until it is out. */
const notGoingOut = (d: Release) =>
  !d.attempts.some((a) => {
    const due = new Date(a.runAt).getTime() - Date.now();
    return a.status === "PUBLISHING" || (a.status === "SCHEDULED" && due < 60_000 && due > -10 * 60_000);
  });
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Approve the exact draft shown above, then publish or schedule it, with a full history. `approveFirst`: one press
 * approves a version awaiting approval and then publishes it (the reel page; the phone does the same).
 */
export function ReleasePanel({ base, id, status, version, qualityBlocked, perms, onChanged, approveFirst = false, pinLink }: { base: string; id: string; status: string; version: number | null; qualityBlocked: boolean; perms: readonly string[]; onChanged: () => void; approveFirst?: boolean; /** A Pinterest pin's destination, so the approver sees where it leads. */ pinLink?: string | null }) {
  const url = `${base}/content/${encodeURIComponent(id)}`;
  const { data, failed: loadError, slow, reload } = useJob(url, { pick: asRelease, done: notGoingOut, intervals: JOB_INTERVALS.publishing, capMs: 600_000 });
  // The hook's own mount poll is the first fetch; only a real change of status or version needs a fresh one.
  const seen = useRef(`${status}:${version}`);
  useEffect(() => {
    const now = `${status}:${version}`;
    if (seen.current === now) return;
    seen.current = now;
    void reload();
  }, [status, version, reload]);

  // A post that was going out has gone out (or stopped): the parent's status follows now, not on its next read.
  const goingOut = data ? !notGoingOut(data) : false;
  const wasGoingOut = useRef(goingOut);
  useEffect(() => {
    if (wasGoingOut.current && !goingOut) onChanged();
    wasGoingOut.current = goingOut;
  }, [goingOut, onChanged]);

  async function act(body: Record<string, unknown>) {
    await request<Release>(url, { method: "POST", body: JSON.stringify(body) });
    await reload();
    // The post's status lives in the parent's list: refresh it now, not on its next poll.
    onChanged();
  }

  // Approve (when awaiting approval) then publish, in order. One read of each afterwards, also after an error; the
  // status this leaves is noted first, so the status effect above doesn't read the release again for it.
  async function approveAndPublish(body: Record<string, unknown>) {
    let reached = status;
    try {
      for (const call of publishCalls(version!, status, body)) {
        await request<Release>(url, { method: "POST", body: JSON.stringify(call) });
        reached = call.action === "decide" ? "APPROVED" : "SCHEDULED";
      }
    } finally {
      seen.current = `${reached}:${version}`;
      await reload();
      onChanged();
    }
  }

  if (!data) {
    return (
      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
        {loadError ? (
          <>
            Couldn&rsquo;t load approval and publishing.
            <Button size="sm" variant="outline" onClick={() => void reload()}>Try again</Button>
          </>
        ) : (
          "Loading approval…"
        )}
      </section>
    );
  }
  const canApprove = perms.includes("content.approve");
  const canPublish = perms.includes("publish.execute");
  // "Approve anyway" past a product issue vouches for product data too (rules.approve).
  const canOverride = canApprove && perms.includes("rules.approve");
  const issues = ["AWAITING_APPROVAL", "APPROVED", "SCHEDULED"].includes(status) ? data.productIssues : [];
  const refused = issues.some((i) => i.refuses);
  const allOverridable = issues.every((i) => !i.refuses || i.overridable);
  // A studio reel's approval never books a post of its own (on the first account, at an old time): publishing does that.
  const noAutoPublish = data.requirements.studio ? { noAutoPublish: true } : {};
  const decideProps = { version: version!, issues, canOverride, onDecide: (verdict: Decision["verdict"], note: string, extra: object) => act({ action: "decide", version, verdict, note, ...(verdict === "APPROVED" ? noAutoPublish : {}), ...extra }) };

  return (
    <section aria-labelledby="release-h" className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <h2 id="release-h" className="text-sm font-semibold">Approval and publishing</h2>
      {data.campaign && <p className="text-sm">{campaignLine(data.campaign)}</p>}
      {pinLink && <p className="break-all text-sm"><span className="text-muted-foreground">This pin leads to</span> {pinLink}</p>}
      {issues.length > 0 && (
        <ul aria-label="Issues" className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm">
          {issues.map((i) => (
            <li key={(i.productId ?? i.campaignId) + i.kind + i.message} className={cn("flex items-start gap-2", i.refuses ? "text-destructive" : "text-muted-foreground")}>
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {i.message}
              {!i.refuses && i.overridable && " (approved anyway)"}
            </li>
          ))}
        </ul>
      )}
      {/* The reel page passes approveFirst; the Overview doesn't. First in the chain, so the form keeps its state across the approval. */}
      {approveFirst && !refused && version !== null && (status === "AWAITING_APPROVAL" || (status === "APPROVED" && data.approvalValid)) ? (
        // A blocking check: the page says why above, and there is no form.
        qualityBlocked ? null : (status === "APPROVED" || canApprove) && canPublish ? (
          <PublishForm base={base} data={data} version={version} approving={status === "AWAITING_APPROVAL"} onPublish={approveAndPublish} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {canPublish ? "Your role can't approve reels, so it can't publish this one." : "Your role can't publish reels. Someone who can publish will post it."}
          </p>
        )
      ) : status === "AWAITING_APPROVAL" && version !== null ? (
        canApprove ? (
          <ApproveForm {...decideProps} blocked={qualityBlocked} />
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for a brand approver to sign off draft v{version}.</p>
        )
      ) : status === "APPROVED" && data.approvalValid && refused ? (
        canApprove ? (
          <ApproveForm {...decideProps} blocked={false} approved />
        ) : (
          <p className="text-sm text-muted-foreground">An issue stops this post. An approver needs to look at it.</p>
        )
      ) : status === "SCHEDULED" && refused ? (
        <p className="text-sm text-muted-foreground">
          {canPublish && data.attempts.some((a) => a.status === "SCHEDULED")
            ? allOverridable ? "Cancel the schedule, then approve anyway or ask for changes." : "Cancel the schedule, then ask for changes."
            : "An issue stops this post. An approver or publisher needs to look at it."}
        </p>
      ) : status === "APPROVED" && data.approvalValid && data.requirements.frames ? (
        canPublish ? (
          <>
            <PublishForm base={base} data={data} version={version!} approving={false} onPublish={(b) => act({ action: "publish", version, ...b })} />
            <StoryByHand base={base} id={id} data={data} canDownload={perms.includes("content.download")} onAct={act} />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {data.byHand && data.scheduledFor ? `Approved. Post by hand · ${dayTime(data.scheduledFor)}.` : "Approved. Someone who can publish will post it."}
            </p>
            {perms.includes("content.download") && <DownloadFrames base={base} id={id} />}
          </>
        )
      ) : status === "APPROVED" && data.approvalValid ? (
        canPublish ? (
          <>
            <PublishForm base={base} data={data} version={version!} approving={false} onPublish={(b) => act({ action: "publish", version, ...b })} />
            <PostedByHand studio={!!data.requirements.studio} onAct={act} />
          </>
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
      {status === "PUBLISHED" && safeHttpUrl(data.postUrl) && (
        <a href={safeHttpUrl(data.postUrl)!.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline">
          Posted by hand <ExternalLink aria-hidden className="size-3.5" />
        </a>
      )}
      <History data={data} canPublish={canPublish} onSettle={(attemptId, action, link) => act({ action, attemptId, ...(link ? { url: link } : {}) })} onAct={act} />
      {slow && <p className="text-sm text-muted-foreground">Still not confirmed. Check the account to see whether it posted.</p>}
    </section>
  );
}

/** approved: the post is already approved but an issue now stops it (only "Approve anyway" or "Ask for changes"). */
function ApproveForm({ version, blocked, issues, canOverride, approved = false, onDecide }: { version: number; blocked: boolean; issues: ProductIssue[]; canOverride: boolean; approved?: boolean; onDecide: (v: Decision["verdict"], note: string, extra: object) => Promise<void> }) {
  // An issue only a rewrite fixes (a wrong price, a changed or withdrawn offer): the note starts with what to fix.
  const [note, setNote] = useState(() => issues.filter((i) => i.refuses && !i.overridable).map((i) => i.message).join("\n"));
  const [pending, setPending] = useState<Decision["verdict"] | "OVERRIDE" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const refused = issues.some((i) => i.refuses);
  const unavailable = issues.some((i) => i.refuses && i.kind === "availability");
  const wrongPrice = issues.some((i) => i.refuses && i.kind === "price");
  // Only what the server marks overridable (availability, an ended offer) can be approved past; anything else needs a
  // rewrite (decide refuses the override).
  const overrideShown = canOverride && refused && issues.every((i) => !i.refuses || i.overridable);
  // "Suggest another product" starts ticked when a product is unavailable; null = not touched yet.
  const [switchPick, setSwitchPick] = useState<boolean | null>(null);
  const switchProducts = switchPick ?? unavailable;

  async function run(verdict: Decision["verdict"] | "OVERRIDE") {
    if (verdict !== "APPROVED" && !note.trim()) {
      setError(verdict === "OVERRIDE" ? "Say why it can go out anyway." : "Write what needs to change, so the team knows what to fix.");
      noteRef.current?.focus();
      return;
    }
    // Rejecting stops the post; ask once more.
    if (verdict === "REJECTED" && !confirmReject) return setConfirmReject(true);
    setConfirmReject(false);
    setPending(verdict);
    setError(null);
    try {
      if (verdict === "OVERRIDE") await onDecide("APPROVED", note, { override: true });
      else await onDecide(verdict, note, verdict === "CHANGES_REQUESTED" && issues.length ? { switchProducts } : {});
      setNote("");
      setSwitchPick(null);
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
          Note <span className="font-normal text-muted-foreground">({issues.length ? "needed to approve anyway, ask for changes or reject" : "needed to request changes or reject"})</span>
        </label>
        <Textarea id="approval-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={overrideShown ? 500 : 2000} aria-invalid={Boolean(error)} aria-describedby={error ? "approval-error" : undefined} />
        {error && <p id="approval-error" role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      {issues.some((i) => i.kind !== "offer") && (
        <div className="flex flex-col gap-1">
          <label className="flex min-h-11 w-fit items-center gap-2 text-sm">
            <input type="checkbox" checked={switchProducts} onChange={(e) => setSwitchPick(e.target.checked)} className="size-4 accent-primary" />
            Suggest another product when asking for changes
          </label>
          {wrongPrice && <p className="text-xs text-muted-foreground">A price in the text is no longer right: ask for changes to fix it</p>}
          {!switchProducts && unavailable && <p className="text-xs text-muted-foreground">The product stays linked, so the post will still be refused</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {/* With "Approve anyway" on offer, the plain approve (which would be refused) steps aside. */}
        {!approved && !overrideShown && (
          <Button onClick={() => run("APPROVED")} disabled={pending !== null || blocked || refused} title={blocked ? "Fix the quality blockers first" : refused ? "An issue stops this post" : undefined}>
            <Check aria-hidden /> {pending === "APPROVED" ? "Approving…" : `Approve v${version}`}
          </Button>
        )}
        {overrideShown && (
          <Button onClick={() => run("OVERRIDE")} disabled={pending !== null || blocked} title="Approve with the issue; your note is recorded">
            <Check aria-hidden /> {pending === "OVERRIDE" ? "Approving…" : "Approve anyway"}
          </Button>
        )}
        <Button variant="outline" onClick={() => run("CHANGES_REQUESTED")} disabled={pending !== null}>
          <Undo2 aria-hidden /> {pending === "CHANGES_REQUESTED" ? "Sending…" : issues.length ? "Ask for changes" : "Request changes"}
        </Button>
        {!approved && (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => run("REJECTED")} disabled={pending !== null}>
            <X aria-hidden /> {pending === "REJECTED" ? "Rejecting…" : confirmReject ? "Confirm: reject this post" : "Reject"}
          </Button>
        )}
        {confirmReject && pending === null && (
          <Button variant="ghost" onClick={() => setConfirmReject(false)}>
            Keep it
          </Button>
        )}
      </div>
    </div>
  );
}

/** approving: the press approves draft v`version` first (approveFirst). */
function PublishForm({ base, data, version, approving, onPublish }: { base: string; data: Release; version: number; approving: boolean; onPublish: (b: Record<string, unknown>) => Promise<void> }) {
  const { requirements: req, accounts } = data;
  // A studio reel posts its own video: no link to ask for.
  const needsLink = req.needsVideo && !req.studio;
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const boards = data.boards?.[accountId];
  const [boardId, setBoardId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  // Carousels take several links, one per line.
  const imageLinks = imageUrl.split("\n").map((l) => l.trim()).filter(Boolean);
  // Files uploaded to the brand's private storage; they go out before any links.
  const [uploads, setUploads] = useState<{ key: string; previewUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageCount = uploads.length + imageLinks.length;
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
        {approving ? `Connect an account for ${name} to publish it.` : `Approved. Connect an account for ${name} to publish it.`}{" "}
        <Link href="/settings?tab=connections" className="font-medium underline underline-offset-2">Open Connections</Link>
      </p>
    );
  }

  const missing =
    (req.needsBoard && !boardId && "Choose a board") ||
    (uploading && "Uploading…") ||
    (imageCount < req.minImages && (req.minImages > 1 ? `Add at least ${req.minImages} images` : "Add an image")) ||
    (imageCount > req.maxImages && (req.maxImages ? `At most ${req.maxImages} images` : "Reels take a video link, not images")) ||
    (!allHttps && "Image links must start with https://") ||
    (needsLink && video?.protocol !== "https:" && "Add a public https video link") ||
    (later && !runAt && "Pick a date and time") ||
    null;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const u = await request<{ key: string; previewUrl: string }>(`${base}/media`, { method: "POST", body, headers: {} });
        setUploads((prev) => [...prev, u]);
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function go() {
    if (!confirming) return setConfirming(true);
    setPending(true);
    setError(null);
    try {
      await onPublish({
        connectionId: accountId,
        ...(req.needsBoard ? { boardId } : {}),
        ...(imageLinks.length ? { imageLinks } : {}),
        ...(uploads.length ? { mediaKeys: uploads.map((u) => u.key) } : {}),
        ...(needsLink ? { videoUrl: videoUrl.trim() } : {}),
        ...(later ? { runAt: new Date(runAt).toISOString() } : {}),
      });
      setConfirming(false);
    } catch (e) {
      setError(errText(e));
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void go(); }} onChange={() => setConfirming(false)}>
      <p className="text-sm text-muted-foreground">{approving ? `Publishing approves draft v${version} first.` : `Draft v${version} is approved. Choose where and when it goes out.`}</p>
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

      {needsLink && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pub-video" className="text-sm font-medium">Video link</label>
          <Input id="pub-video" type="url" inputMode="url" placeholder="https://…/reel.mp4" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="h-11" aria-describedby="pub-video-help" />
          <p id="pub-video-help" className="text-xs text-muted-foreground">A public https link to an MP4 (vertical, 3 to 90 seconds). Instagram downloads it from there.</p>
        </div>
      )}
      {req.maxImages > 0 && (
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pub-image" className="text-sm font-medium">
          {many ? `Images (${req.minImages} to ${req.maxImages}; links one per line)` : "Image"} {!req.needsImage && <span className="font-normal text-muted-foreground">(optional)</span>}
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
        <p id="pub-image-help" className="text-xs text-muted-foreground">Upload {req.provider === "INSTAGRAM" ? "JPG" : "JPG or PNG"} images (up to 4 MB each), or paste public https link{many ? "s" : ""}. {name} downloads them from there.</p>
        {uploads.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Uploaded images">
            {uploads.map((u, i) => (
              <li key={u.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
                <img src={u.previewUrl} alt={`Uploaded image ${i + 1}`} className="size-16 rounded-md border border-border object-cover" />
                <button type="button" onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))} aria-label={`Remove image ${i + 1}`} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileInput} type="file" accept={req.provider === "INSTAGRAM" ? "image/jpeg" : "image/jpeg,image/png"} multiple={many} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void upload(e.target.files)} />
        <Button type="button" variant="outline" className="w-fit" disabled={uploading || imageCount >= req.maxImages} onClick={() => fileInput.current?.click()}>
          <ImageUp aria-hidden /> {uploading ? "Uploading…" : many ? "Upload images" : "Upload an image"}
        </Button>
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
          <div className="flex flex-wrap items-center gap-3">
            <Input type="datetime-local" aria-label="Publish date and time" value={runAt} min={nowLocalInput()} onChange={(e) => setRunAt(e.target.value)} className="h-11 w-fit" />
            <span className="text-sm text-muted-foreground">Time zone: {zoneCity(browserZone())}</span>
          </div>
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

/**
 * An approved story posted by a person: when it is due (Today shows it from then on), the frames as one zip, then
 * "I posted it" with the story's link if they have it.
 */
const downloadStoryFrames = (base: string, id: string) => downloadFile(`${base}/stories/${encodeURIComponent(id)}/package?format=zip`, `story-${id}.zip`);

/** An approved story's frames as a zip, for someone who can download but not publish (content.download, e.g. a client reviewer). */
function DownloadFrames({ base, id }: { base: string; id: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setPending(true);
    setError(null);
    try {
      await downloadStoryFrames(base, id);
    } catch (e) {
      setError(errText(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="outline" className="w-fit" disabled={pending} onClick={() => void run()}>
        <Download aria-hidden /> {pending ? "Preparing…" : "Download frames"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function StoryByHand({ base, id, data, canDownload, onAct }: { base: string; id: string; data: Release; canDownload: boolean; onAct: (body: Record<string, unknown>) => Promise<void> }) {
  const [at, setAt] = useState("");
  const [link, setLink] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const due = data.byHand && data.scheduledFor ? data.scheduledFor : null;

  async function run(key: string, fn: () => Promise<unknown>) {
    setPending(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setPending(null);
    }
  }
  const download = () => downloadStoryFrames(base, id);

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Or post it by hand</h3>
      {due && <p className="text-sm">Post by hand · {dayTime(due)}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="byhand-at" className="text-sm">
            {due ? "Change the time" : "Post by hand at"} <span className="text-muted-foreground">(empty: now)</span>
          </label>
          <Input id="byhand-at" type="datetime-local" value={at} min={nowLocalInput()} onChange={(e) => setAt(e.target.value)} className="h-11 w-fit" />
        </div>
        <Button variant="outline" disabled={pending !== null} onClick={() => run("at", () => onAct({ action: "byHand", at: (at ? new Date(at) : new Date()).toISOString() }).then(() => setAt("")))}>
          <CalendarClock aria-hidden /> {pending === "at" ? "Saving…" : due ? "Change time" : "Post by hand"}
        </Button>
        {due && (
          <Button variant="ghost" disabled={pending !== null} onClick={() => run("off", () => onAct({ action: "byHand", at: null }))}>
            {pending === "off" ? "Saving…" : "Stop posting by hand"}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canDownload && (
          <Button variant="outline" disabled={pending !== null} onClick={() => run("zip", download)}>
            <Download aria-hidden /> {pending === "zip" ? "Preparing…" : "Download frames"}
          </Button>
        )}
        <Input type="url" inputMode="url" aria-label="Story link (optional)" placeholder="Story link (optional)" value={link} onChange={(e) => setLink(e.target.value)} className="h-9 w-64 max-w-full" />
        <Button disabled={pending !== null} onClick={() => run("posted", () => onAct({ action: "postedByHand", ...(link.trim() ? { url: link.trim() } : {}) }))}>
          <Check aria-hidden /> {pending === "posted" ? "Saving…" : "I posted it"}
        </Button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        {BY_HAND_STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      {error && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p>}
    </div>
  );
}

/** An approved post someone put up themselves: says so, with the post's link if they have it. The server checks the link and shows its refusal as sent. */
/** `studio`: a studio reel needs its link (its results are followed from it), as on the phone. */
function PostedByHand({ studio, onAct }: { studio: boolean; onAct: (body: Record<string, unknown>) => Promise<void> }) {
  const [link, setLink] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await onAct({ action: "postedByHand", ...(link.trim() ? { url: link.trim() } : {}) });
    } catch (e) {
      setError(errText(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Posted it yourself?</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="url" inputMode="url" aria-label={studio ? "Post link" : "Post link (optional)"} placeholder={studio ? "Post link (required)" : "Post link (optional)"} required={studio} value={link} onChange={(e) => setLink(e.target.value)} className="h-9 w-64 max-w-full" />
        <Button variant="outline" disabled={pending || (studio && !link.trim())} onClick={save}>
          <Check aria-hidden /> {pending ? "Saving…" : "I posted it"}
        </Button>
      </div>
      {error && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p>}
    </div>
  );
}

const ATTEMPT: Record<Attempt["status"], string> = {
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing…",
  PUBLISHED: "Published",
  FAILED: "Not posted",
  PENDING_VERIFY: "Check needed",
  PARTIAL: "Partly posted",
  CANCELLED: "Cancelled",
};
const VERDICT: Record<Decision["verdict"], string> = { APPROVED: "approved", CHANGES_REQUESTED: "asked for changes to", REJECTED: "rejected" };

function History({ data, canPublish, onSettle, onAct }: { data: Release; canPublish: boolean; onSettle: (attemptId: string, action: "cancel" | "posted" | "not-posted", link?: string) => Promise<void>; onAct: (body: Record<string, unknown>) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [link, setLink] = useState("");
  // A partly posted story whose posted frames expired: the server said so; the next "Post the rest" confirms.
  const [expiredOk, setExpiredOk] = useState<string | null>(null);
  const [doneAsk, setDoneAsk] = useState<string | null>(null);
  const rows = [
    ...data.decisions.map((d) => ({ at: d.at, key: d.id, d, a: null as Attempt | null })),
    ...data.attempts.map((a) => ({ at: a.publishedAt ?? a.runAt, key: a.id, d: null as Decision | null, a })),
  ].sort((x, y) => +new Date(y.at) - +new Date(x.at));
  if (!rows.length) return null;

  async function settle(id: string, action: "cancel" | "posted" | "not-posted") {
    if (action === "posted" && link.trim() && !safeHttpUrl(link.trim())) return setError("That post link isn't a web address.");
    setPending(id + action);
    setError(null);
    try {
      await onSettle(id, action, action === "posted" ? link.trim() : undefined);
    } catch (e) {
      setError(errText(e));
    } finally {
      setPending(null);
    }
  }

  // A story's own actions: post the rest, mark as done, say whether a frame appeared.
  async function story(key: string, body: Record<string, unknown>) {
    setPending(key);
    setError(null);
    try {
      await onAct(body);
      setExpiredOk(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "story.expiredConfirm") setExpiredOk(String(body.attemptId));
      setError(errText(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="border-t border-border pt-4">
      <h3 className="text-xs font-semibold text-muted-foreground">History</h3>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <ol className="mt-2 flex flex-col divide-y divide-border">
        {rows.map(({ key, d, a }) => {
          const overdue = a?.status === "SCHEDULED" && new Date(a.runAt).getTime() < Date.now();
          return d ? (
            <li key={key} className="flex flex-col gap-0.5 py-2.5 text-sm">
              <span>
                <span className="font-medium">{d.by}</span> {VERDICT[d.verdict]} {d.version ? `v${d.version}` : "an earlier draft"}
                {d.override && ` anyway: ${d.override.join(", ")}`}
                <span className="text-muted-foreground"> · {dayTime(d.at)}</span>
                {d.byClient && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{d.verdict === "APPROVED" ? "Approved by client" : "Client"}</span>}
                {d.verdict === "APPROVED" && !d.current && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">no longer valid</span>}
              </span>
              {d.note && <span className="text-muted-foreground">&ldquo;{d.note}&rdquo;</span>}
            </li>
          ) : a ? (
            <li key={key} className="flex flex-col gap-1.5 py-2.5 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={a.status}>{overdue ? "Overdue" : ATTEMPT[a.status]}</StatusBadge>
                <span>
                  {PROVIDER_NAME[a.provider] ?? a.provider} · {a.account}
                  <span className="text-muted-foreground"> · {a.status === "PUBLISHED" && a.publishedAt ? dayTime(a.publishedAt) : dayTime(a.runAt)} · by {a.by}</span>
                </span>
                {a.status === "PUBLISHED" && safeHttpUrl(a.externalUrl) && (
                  <a href={safeHttpUrl(a.externalUrl)!.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                    View post <ExternalLink aria-hidden className="size-3" />
                  </a>
                )}
              </span>
              {a.frames !== undefined && a.progress && (
                <span className="text-muted-foreground">{a.progress.filter((f) => f.state === "published").length} of {a.frames} frames posted</span>
              )}
              {a.error && a.status !== "PUBLISHED" && <span className="text-muted-foreground">{a.error}</span>}
              {overdue && <span className="text-muted-foreground">Overdue: waiting for the job runner to post it.</span>}
              {!canPublish && a.status === "PENDING_VERIFY" && <span className="text-muted-foreground">Waiting for someone who can publish to confirm whether it posted.</span>}
              {canPublish && a.status === "SCHEDULED" && (
                <span>
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => settle(a.id, "cancel")}>
                    {pending === a.id + "cancel" ? "Cancelling…" : "Cancel"}
                  </Button>
                </span>
              )}
              {canPublish && a.frames !== undefined && a.status === "PARTIAL" && (
                <span className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => story(a.id + "rest", { action: "postRest", attemptId: a.id, ...(expiredOk === a.id ? { confirm: true } : {}) })}>
                    {pending === a.id + "rest" ? "Posting…" : expiredOk === a.id ? "Post the rest anyway" : "Post the rest"}
                  </Button>
                  {/* Two steps: marking done closes off "Post the rest" for good. */}
                  <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => (doneAsk === a.id ? story(a.id + "done", { action: "markDone", attemptId: a.id }) : setDoneAsk(a.id))}>
                    {pending === a.id + "done" ? "Saving…" : doneAsk === a.id ? "Yes, leave the rest unposted" : "Mark as done"}
                  </Button>
                </span>
              )}
              {canPublish && a.frames !== undefined && a.status === "PENDING_VERIFY" && a.progress?.filter((f) => f.state === "publishing").map((f) => (
                <span key={f.i} className="flex flex-wrap items-center gap-2">
                  Did frame {f.i + 1} appear?
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => story(a.id + "yes", { action: "settleFrame", attemptId: a.id, frame: f.i, appeared: true })}>Yes</Button>
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => story(a.id + "no", { action: "settleFrame", attemptId: a.id, frame: f.i, appeared: false })}>No</Button>
                </span>
              ))}
              {canPublish && a.frames === undefined && a.status === "PENDING_VERIFY" && (
                <span className="flex flex-wrap items-center gap-2">
                  <Input type="url" inputMode="url" aria-label="Post link (optional)" placeholder="Post link (optional)" value={link} onChange={(e) => setLink(e.target.value)} className="h-9 w-64 max-w-full" />
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => settle(a.id, "posted")}>It&rsquo;s live</Button>
                  <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => settle(a.id, "not-posted")}>It didn&rsquo;t post</Button>
                </span>
              )}
            </li>
          ) : null;
        })}
      </ol>
    </div>
  );
}
