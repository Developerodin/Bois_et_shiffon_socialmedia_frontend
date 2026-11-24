"use client";

import { useEffect, useState } from "react";
import { spansToText, textToSpans, type ArticleBlock, type ArticleShopifyAction, type BlogArticleDto, type BlogArticleStatus } from "@/shared";
import { ArticleBody } from "@/components/blog/article-body";
import { blogApi } from "@/components/blog/api";
import { ACTION_LABEL, ShopifyDialog } from "@/components/blog/shopify-dialog";
import { errorMessage } from "@/components/settings/api";
import { ListSkeleton, selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<BlogArticleStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  HIDDEN_IN_SHOPIFY: "Hidden in Shopify",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

/** The Shopify step an article is ready for, if any: send it hidden, send its changes, or publish it. */
export function shopifyAction(a: Pick<BlogArticleDto, "status" | "shopifyId">): ArticleShopifyAction | null {
  if (a.status === "APPROVED") return a.shopifyId ? "update" : "create";
  return a.status === "HIDDEN_IN_SHOPIFY" ? "publish" : null;
}

/** The editor's form of a block: its type and one line of text per line ([link](url), **bold**, *italic*). */
export type DraftBlock = { type: ArticleBlock["type"]; text: string };
export const toDraft = (blocks: ArticleBlock[]): DraftBlock[] => blocks.map((b) => ({ type: b.type, text: b.lines.map(spansToText).join("\n") }));
/** Back to blocks; empty lines and blocks are dropped, and a heading or paragraph keeps one line (joined by spaces). */
export function fromDraft(draft: DraftBlock[]): ArticleBlock[] {
  return draft.flatMap((d) => {
    const lines = d.text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const kept = d.type === "ul" || d.type === "ol" ? lines : [lines.join(" ")];
    return [{ type: d.type, lines: kept.map(textToSpans) }];
  });
}

const BLOCK_TYPES: { value: ArticleBlock["type"]; label: string }[] = [
  { value: "h2", label: "Heading" },
  { value: "h3", label: "Subheading" },
  { value: "p", label: "Paragraph" },
  { value: "ul", label: "Bulleted list" },
  { value: "ol", label: "Numbered list" },
];

/**
 * /blog (flag `blog`): the brand's articles; write one from a topic or a task (`taskId` from an SEO task's "Write an
 * article"), edit it, approve it, send it to Shopify hidden, then publish it. `perms` only hides controls; the server checks.
 */
export function BlogBoard({ w, b, perms, taskId }: { w: string; b: string; perms: string[]; taskId: string | null }) {
  const [articles, setArticles] = useState<BlogArticleDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canCreate = perms.includes("content.create");

  const load = () => {
    setFailed(false);
    blogApi.list(w, b).then(
      (r) => setArticles(r.articles),
      () => setFailed(true),
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once; the board remounts on a brand switch
  useEffect(load, []);

  const put = (a: BlogArticleDto) => setArticles((list) => [a, ...(list ?? []).filter((x) => x.id !== a.id)]);
  const create = async (body: { topic?: string; taskId?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const { article } = await blogApi.create(w, b, body);
      put(article);
      setSelected(article.id);
      setTopic("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (failed) return <LoadFailed what="the articles" onRetry={load} className="px-5 py-6" />;
  if (!articles) return <ListSkeleton label="Loading articles" rows={3} />;
  const current = articles.find((a) => a.id === selected) ?? null;
  const fromTask = taskId && !articles.some((a) => a.taskId === taskId) ? taskId : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        {canCreate && fromTask ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm">
            <p>Write an article for the task you came from.</p>
            <Button size="sm" disabled={busy} onClick={() => create({ taskId: fromTask })}>
              Start from the task
            </Button>
          </div>
        ) : null}
        {canCreate ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (topic.trim()) void create({ topic: topic.trim() });
            }}
          >
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="New article: its topic" maxLength={200} aria-label="New article topic" />
            <Button type="submit" size="sm" disabled={busy || !topic.trim()}>
              Add
            </Button>
          </form>
        ) : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {articles.length ? (
          <ul className="flex flex-col gap-1">
            {articles.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelected(a.id)}
                  className={cn("flex w-full flex-col items-start gap-1 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted", a.id === selected && "bg-muted")}
                >
                  <span className="font-medium">{a.title}</span>
                  <StatusBadge status={a.status}>{STATUS_LABEL[a.status]}</StatusBadge>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No articles yet.</p>
        )}
      </div>
      {current ? (
        <ArticleEditor key={current.id} w={w} b={b} article={current} perms={perms} onChange={put} onRemoved={() => setArticles((l) => (l ?? []).filter((x) => x.id !== current.id))} />
      ) : (
        <p className="text-sm text-muted-foreground">Pick an article, or add one.</p>
      )}
    </div>
  );
}

function ArticleEditor({ w, b, article, perms, onChange, onRemoved }: { w: string; b: string; article: BlogArticleDto; perms: string[]; onChange(a: BlogArticleDto): void; onRemoved(): void }) {
  const canEdit = perms.includes("content.create") && article.status !== "PUBLISHED" && article.status !== "ARCHIVED";
  const canApprove = perms.includes("content.approve") && (article.status === "DRAFT" || article.status === "IN_REVIEW");
  const next = perms.includes("publish.execute") ? shopifyAction(article) : null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: article.title, handle: article.handle, summary: article.summary ?? "", tags: article.tags.join(", "), blocks: toDraft(article.blocks) });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ArticleShopifyAction | null>(null);

  const run = async (what: string, call: () => Promise<{ article: BlogArticleDto }>) => {
    setBusy(what);
    setError(null);
    try {
      const { article: a } = await call();
      onChange(a);
      setEditing(false);
      setForm({ title: a.title, handle: a.handle, summary: a.summary ?? "", tags: a.tags.join(", "), blocks: toDraft(a.blocks) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const save = () =>
    run("save", () =>
      blogApi.update(w, b, article.id, {
        version: article.version,
        title: form.title,
        handle: form.handle,
        summary: form.summary.trim() || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        blocks: fromDraft(form.blocks),
      }),
    );
  const setBlock = (i: number, patch: Partial<DraftBlock>) => setForm((f) => ({ ...f, blocks: f.blocks.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={article.status}>{STATUS_LABEL[article.status]}</StatusBadge>
        {article.status === "APPROVED" || article.status === "HIDDEN_IN_SHOPIFY" ? <span className="text-xs text-muted-foreground">An edit after approval sends the article back to review.</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {canEdit && !editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
        {canEdit ? (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("write", () => blogApi.write(w, b, article.id))}>
            {busy === "write" ? "Writing… (up to a minute)" : article.blocks.length ? "Rewrite with AI" : "Write with AI"}
          </Button>
        ) : null}
        {canApprove ? (
          <Button size="sm" disabled={!!busy || !article.blocks.length} onClick={() => run("approve", () => blogApi.decide(w, b, article.id, { version: article.version, verdict: "APPROVED" }))}>
            Approve
          </Button>
        ) : null}
        {next ? (
          <Button size="sm" disabled={!!busy} onClick={() => setDialog(next)}>
            {ACTION_LABEL[next]}
          </Button>
        ) : null}
        {perms.includes("content.create") ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={async () => {
              if (!window.confirm(article.shopifyId ? "Archive this article here? Shopify's copy stays as it is." : "Delete this article?")) return;
              try {
                await blogApi.remove(w, b, article.id);
                onRemoved();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {article.shopifyId ? "Archive" : "Delete"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {canApprove ? (
        <div className="flex flex-col gap-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change" maxLength={1000} aria-label="What needs to change" rows={2} />
          <Button size="sm" variant="outline" className="self-start" disabled={!!busy || !note.trim()} onClick={() => run("changes", () => blogApi.decide(w, b, article.id, { version: article.version, verdict: "CHANGES_REQUESTED", note: note.trim() }))}>
            Ask for changes
          </Button>
        </div>
      ) : null}
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            Title
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} required />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Address (lower-case letters, digits and dashes)
            <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} maxLength={120} required />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Summary
            <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={500} rows={2} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tags (comma-separated)
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </label>
          <p className="text-xs text-muted-foreground">In the text: [words](https://link) for a link, **bold**, *italic*. A list takes one item per line.</p>
          {form.blocks.map((blk, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-xl border border-border p-3">
              <div className="flex gap-2">
                <select className={selectClass} value={blk.type} onChange={(e) => setBlock(i, { type: e.target.value as DraftBlock["type"] })} aria-label="Block type">
                  {BLOCK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, blocks: f.blocks.filter((_, j) => j !== i) }))}>
                  Remove
                </Button>
              </div>
              <Textarea value={blk.text} onChange={(e) => setBlock(i, { text: e.target.value })} rows={blk.type === "h2" || blk.type === "h3" ? 1 : 4} aria-label="Block text" />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, blocks: [...f.blocks, { type: "p", text: "" }] }))}>
              Add a block
            </Button>
            <Button type="submit" size="sm" disabled={!!busy}>
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <article className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{article.title}</h2>
          {article.summary ? <p className="text-sm text-muted-foreground">{article.summary}</p> : null}
          <ArticleBody blocks={article.blocks} />
        </article>
      )}
      {dialog ? (
        <ShopifyDialog
          w={w}
          b={b}
          article={article}
          action={dialog}
          onClose={() => setDialog(null)}
          onDone={(a) => {
            setDialog(null);
            onChange(a);
          }}
        />
      ) : null}
    </div>
  );
}
