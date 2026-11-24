"use client";

import { useEffect, useState } from "react";
import type { ArticlePublishPreview, ArticleShopifyAction, ArticleWritePreview, BlogArticleDto } from "@/shared";
import { ArticleBody, httpHref } from "@/components/blog/article-body";
import { blogApi, type ArticlePreview } from "@/components/blog/api";
import { ApiError, errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const ACTION_LABEL: Record<ArticleShopifyAction, string> = { create: "Send to Shopify (hidden)", update: "Send changes to Shopify", publish: "Publish" };

/** Why a confirm can't go yet, from the preview's `writes`; null when it can. */
export function writesNotice(writes: ArticlePreview["writes"]): string | null {
  if (writes.ready) return null;
  return writes.reason === "NOT_CONNECTED" ? "Shopify writes aren't connected yet. Nothing will be sent." : `Shopify access is missing ${writes.scope}. Ask for it to be added to the store's app.`;
}

/**
 * Exactly what the confirm writes, all from the server's preview (what its token covers): every field, every link target
 * (those off the brand's website flagged), and the body rendered from the blocks the HTML is made from.
 */
export function ShopifyPreviewBody({ action, preview }: { action: ArticleShopifyAction; preview: ArticlePreview }) {
  const notice = writesNotice(preview.writes);
  const row = (term: string, value: string) => (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words">{value || "None"}</dd>
    </div>
  );
  if (action === "publish") {
    const p = preview.preview as ArticlePublishPreview;
    return (
      <div className="flex flex-col gap-4 text-sm">
        {notice ? <p className="rounded-xl border border-border bg-muted/50 px-3 py-2">{notice}</p> : null}
        <p>Makes the article visible on the store. Check it in Shopify first.</p>
        <dl className="flex flex-col gap-1">
          {row("Title", p.title)}
          {row("Address", p.handle)}
        </dl>
      </div>
    );
  }
  const p = preview.preview as ArticleWritePreview;
  return (
    <div className="flex flex-col gap-4 text-sm">
      {notice ? <p className="rounded-xl border border-border bg-muted/50 px-3 py-2">{notice}</p> : null}
      <p>{action === "create" ? "Created hidden: nobody sees it on the store until you press Publish here." : "Replaces the hidden article in Shopify. It stays hidden."}</p>
      <dl className="flex flex-col gap-1">
        {row("Title", p.title)}
        {row("Address", p.handle)}
        {row("Author", p.author)}
        {row("Summary", p.summary)}
        {row("Tags", p.tags.join(", "))}
      </dl>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">Links in the article ({p.links.length})</h3>
        {p.links.length ? (
          <ul className="flex flex-col gap-1 break-all">
            {p.links.map((l) => (
              <li key={l}>
                {httpHref(l) ? <a href={httpHref(l)!} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{l}</a> : l}
                {p.externalLinks.includes(l) ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Outside your website</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No links.</p>
        )}
      </div>
      <div className="rounded-xl border border-border p-4">
        <ArticleBody blocks={p.blocks} />
      </div>
    </div>
  );
}

/** Preview → the person confirms → written at most once. A change since the preview shows the new one to check again. */
export function ShopifyDialog({ w, b, article, action, onClose, onDone }: { w: string; b: string; article: BlogArticleDto; action: ArticleShopifyAction; onClose(): void; onDone(a: BlogArticleDto): void }) {
  const [state, setState] = useState<ArticlePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setState(null);
    try {
      setState(await blogApi.preview(w, b, article.id, action));
    } catch (e) {
      setError(errorMessage(e, "Couldn't prepare the change. Try again."));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, []);

  const confirm = async () => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      const done = await blogApi.confirm(w, b, article.id, action, state.confirmToken);
      onDone(done.article);
    } catch (e) {
      setError(errorMessage(e, "Couldn't send it. Try again."));
      if (e instanceof ApiError && e.code === "CHANGED") await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ACTION_LABEL[action]}</DialogTitle>
          <DialogDescription>This is exactly what will be written to Shopify.</DialogDescription>
        </DialogHeader>
        {state ? <ShopifyPreviewBody action={action} preview={state} /> : !error ? <p className="text-sm text-muted-foreground">Preparing…</p> : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || !state || !state.writes.ready}>
            {busy ? "Sending…" : ACTION_LABEL[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
