"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAGE_SIZES, productsApi, stockLabel, thumbUrl, type FullProduct, type PageQuery, type Product, type ProductPage } from "@/components/products/api";
import { CampaignsSection } from "@/components/products/campaigns";
import { errorMessage } from "@/components/settings/api";
import { ConfirmDialog, ListSkeleton, LoadError, selectClass, useLoad } from "@/components/settings/shared";
import { pageItems } from "@/lib/page-items";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { safeHttpUrl } from "@/shared";

const SOURCE_LINE = {
  SHOPIFY: "From your Shopify store",
  WEBSITE: "From your website's product feed",
} as const;

function price(p: Product) {
  if (p.price === null) return "—";
  if (!p.currency) return p.price;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(Number(p.price));
  } catch {
    return `${p.price} ${p.currency}`;
  }
}

/**
 * `canVouch` (rules.approve): may set stock, prices and product facts; the server refuses them otherwise.
 * `canManageCommercial` (commercial.manage): may set campaigns, offers and priorities.
 */
type Props = { workspaceId: string; brandId: string; canEdit: boolean; canVouch: boolean; canManageCommercial: boolean };
const count = (n: number) => n.toLocaleString();

/**
 * The table's place, read from the URL so refresh, Back/Forward and a shared link keep it. Anything unexpected falls
 * back to the default (page 1, 50 rows, no search, all stock) rather than an error.
 */
function readQuery(sp: URLSearchParams): PageQuery {
  return {
    page: Math.min(100_000, Math.max(1, Math.floor(Number(sp.get("page"))) || 1)),
    limit: PAGE_SIZES.find((n) => n === Number(sp.get("limit"))) ?? 50,
    q: (sp.get("q") ?? "").trim().slice(0, 200),
    stock: (["in", "out"] as const).find((v) => v === sp.get("stock")) ?? "",
  };
}

export function ProductsBoard({ workspaceId, brandId, canEdit, canVouch, canManageCommercial }: Props) {
  const fetcher = useCallback(() => productsApi.list(workspaceId, brandId), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const [editing, setEditing] = useState<FullProduct | "new" | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The table pages on the server (?page=); the full list above still feeds Campaigns and the empty state.
  const pathname = usePathname();
  const { page, limit, q, stock } = readQuery(useSearchParams());
  const key = `${page}|${limit}|${q}|${stock}`;
  const [table, setTable] = useState<{ key: string; data: ProductPage } | null>(null);
  const [tableError, setTableError] = useState<{ key: string; message: string } | null>(null);
  const [tableNonce, setTableNonce] = useState(0);
  const [search, setSearch] = useState(q);

  /** Moves the table: page, size and filter changes push (Back undoes them); typing replaces. Defaults leave the URL. */
  const go = useCallback(
    (next: Partial<PageQuery>, how: "push" | "replace" = "push") => {
      const sp = new URLSearchParams(window.location.search);
      const to = { ...readQuery(sp), ...next };
      const set = (name: string, value: string, fallback: string) => (value === fallback ? sp.delete(name) : sp.set(name, value));
      set("page", String(to.page), "1");
      set("limit", String(to.limit), "50");
      set("q", to.q.trim(), "");
      set("stock", to.stock, "");
      // Native history, not router.push: Next syncs useSearchParams from it without re-rendering the page on the
      // server, which cost ~3 s a click (the page reloads the shell). The board fetches its own data.
      window.history[how === "push" ? "pushState" : "replaceState"](null, "", sp.size ? `${pathname}?${sp}` : pathname);
    },
    [pathname],
  );

  // Pages already asked for, by query: turning back is instant, and a click on a page being prefetched reuses that
  // request. Cleared whenever the catalogue changes (reloadAll). ponytail: unbounded, fine for the few dozen pages a
  // session visits; cap it if catalogues reach thousands of pages.
  const pages = useRef(new Map<string, Promise<ProductPage>>());
  const fetchPage = useCallback(
    (at: PageQuery) => {
      const k = `${workspaceId}|${brandId}|${at.page}|${at.limit}|${at.q}|${at.stock}`;
      let p = pages.current.get(k);
      if (!p) {
        p = productsApi.page(workspaceId, brandId, at);
        pages.current.set(k, p);
        p.catch(() => pages.current.delete(k)); // a failed page is asked again, not remembered
      }
      return p;
    },
    [workspaceId, brandId],
  );

  // A newer page, size or filter cancels the reply still on its way, so a slow page can't land over a newer one.
  useEffect(() => {
    let cancelled = false;
    fetchPage({ page, limit, q, stock }).then(
      (data) => {
        if (cancelled) return;
        setTable({ key, data });
        // Past the end (a shared link, or the last row on the last page deleted): show the last page there is.
        if (data.pagination.page !== page) return go({ page: data.pagination.page }, "replace");
        // The pages either side load in the background, so Next and Previous show at once.
        for (const n of [page + 1, page - 1])
          if (n >= 1 && n <= data.pagination.totalPages) fetchPage({ page: n, limit, q, stock }).catch(() => {});
      },
      (err: unknown) => !cancelled && setTableError({ key, message: errorMessage(err, "Couldn't load this page. Try again.") }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchPage, page, limit, q, stock, key, tableNonce, go]);

  // Typing settles for 300 ms before the search goes to the URL, back to page 1.
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => go({ q: search, page: 1 }, "replace"), 300);
    return () => clearTimeout(t);
  }, [search, q, go]);
  // Back/Forward changed the search: show it in the box.
  useEffect(() => {
    setSearch((s) => (s.trim() === q ? s : q));
  }, [q]);

  const reloadAll = useCallback(() => {
    pages.current.clear();
    reload();
    setTableNonce((n) => n + 1);
  }, [reload]);
  const turn = (to: number) => {
    go({ page: to });
    document.getElementById("catalogue")?.scrollIntoView({ block: "start" });
  };

  const data = state.kind === "ready" ? state.data : null;
  const lastSync = data?.catalogSync ?? null;

  // While a sync is queued or running, poll the light status every 4 s; read the full list once it's done
  // (or after 3 minutes).
  useEffect(() => {
    if (!syncing) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      const status = await productsApi.status(workspaceId, brandId).catch(() => null);
      if ((status && !status.running) || Date.now() - started > 180_000) {
        setSyncing(false);
        reloadAll();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [syncing, workspaceId, brandId, reloadAll]);

  async function syncNow() {
    setError(null);
    try {
      await productsApi.sync(workspaceId, brandId);
      setSyncing(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // The list leaves descriptions out; editing reads the whole product first.
  async function edit(p: Product) {
    setError(null);
    try {
      setEditing((await productsApi.get(workspaceId, brandId, p.id)).product);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Empty and error states are boxes of their own, so only the skeleton and the table go in the card.
  const inCard = state.kind === "loading" || (state.kind === "ready" && state.data.products.length > 0);
  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading products" />;
  else if (state.kind === "forbidden")
    body = <EmptyState icon={Package} title="You can't see this business's products" description="Your role doesn't include access to this business." />;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else if (state.data.products.length === 0)
    body = (
      <EmptyState
        icon={Package}
        title="No products yet"
        description="Products come from your Shopify store when it's connected (Connections), else from your website's public product feed, which Shopify stores publish. Each sync runs daily. You can also add products by hand."
      />
    );
  else {
    const all = state.data.products.length;
    const shown = table?.key === key ? table.data : null;
    const failed = tableError?.key === key ? tableError.message : null;
    // While the next page loads, the last one stays in place, dimmed, so the table doesn't jump.
    const rows = shown ?? table?.data ?? null;
    const paging = rows?.pagination ?? null;
    // The page asked for, highlighted at once while its rows load (the served page once they have).
    const at = shown ? (paging?.page ?? page) : page;
    body = (
      <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          aria-label="Search products"
          placeholder="Search by name or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <select
          aria-label="Filter by stock"
          value={stock}
          onChange={(e) => go({ stock: e.target.value as PageQuery["stock"], page: 1 })}
          className={cn(selectClass, "w-full sm:w-auto")}
        >
          <option value="">All stock</option>
          <option value="in">In stock</option>
          <option value="out">Out of stock or unknown</option>
        </select>
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {(q || stock) && shown ? `${count(shown.pagination.total)} of ${count(all)} products` : `${count(all)} products`}
        </p>
      </div>
      {failed ? (
        <LoadError message={failed} onRetry={() => setTableNonce((n) => n + 1)} />
      ) : !rows ? (
        <ListSkeleton label="Loading products" />
      ) : rows.products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">No products match this search and filter.</p>
          <Button variant="outline" size="sm" onClick={() => (setSearch(""), go({ q: "", stock: "", page: 1 }))}>
            Clear search and filter
          </Button>
        </div>
      ) : (
      /* The page scrolls, not this box (a second scrollbar otherwise): from lg up the column heads stick to the top
          edge of <main>, the negative top cancelling its padding. Below lg the table can be wider than its box (636 px at its narrowest), so
          it scrolls sideways there; overflow-x auto makes this box the heads' scroller, so they don't stick below lg. */
      <div aria-busy={!shown} className={cn("-mx-5 overflow-x-auto transition-opacity lg:overflow-x-clip motion-reduce:transition-none", !shown && "opacity-60")}>
        <table className="w-full text-left text-sm">
          <thead className="sticky -top-4 z-10 border-b border-border bg-card text-xs text-muted-foreground sm:-top-6">
            <tr>
              <th scope="col" className="px-3 py-3 sm:px-5 font-medium">Product</th>
              <th scope="col" className="hidden px-3 py-3 sm:px-5 font-medium md:table-cell">SKU</th>
              <th scope="col" className="px-3 py-3 sm:px-5 text-right font-medium">Price</th>
              <th scope="col" className="px-3 py-3 sm:px-5 font-medium">Stock</th>
              {canEdit ? <th scope="col" className="px-3 py-3 sm:px-5"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.products.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 sm:px-5">
                  <div className="flex items-center gap-3">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- store images come from any host; next/image needs each one allowed
                      <img src={thumbUrl(p.imageUrl, 64)} alt="" loading="lazy" className="size-8 shrink-0 rounded-md bg-muted object-cover" />
                    ) : (
                      <span className="size-8 shrink-0 rounded-md bg-muted" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      {safeHttpUrl(p.url) ? (
                        <a href={safeHttpUrl(p.url)!.href} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-medium text-foreground hover:underline">
                          {p.title}
                        </a>
                      ) : (
                        <p className="line-clamp-2 font-medium text-foreground">{p.title}</p>
                      )}
                      {/* The facts a person added; nothing when there are none, rather than a filler line on every row. */}
                      {p.source === "MANUAL" || p.materials || p.dimensions ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.source === "MANUAL" ? "Added by hand" : null, p.materials, p.dimensions].filter(Boolean).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="hidden px-3 py-2 sm:px-5 whitespace-nowrap text-muted-foreground md:table-cell">{p.sku ?? "—"}</td>
                <td className="px-3 py-2 sm:px-5 text-right whitespace-nowrap tabular-nums">{price(p)}</td>
                <td className="px-3 py-2 sm:px-5">
                  <p className="whitespace-nowrap">{stockLabel(p)}</p>
                  {/* Synced stock is as of the last sync (shown once, in the header); only a hand-set check gets its own time. */}
                  {p.source === "MANUAL" && p.stockCheckedAt ? <p className="text-xs whitespace-nowrap text-muted-foreground">checked {timeAgo(p.stockCheckedAt)}</p> : null}
                </td>
                {canEdit ? (
                  <td className="px-3 py-2 sm:px-5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => void edit(p)}>Edit</Button>
                    {p.source === "MANUAL" ? (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(p)}>Delete</Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {paging && rows?.products.length ? (
        <nav aria-label="Product pages" className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-sm text-muted-foreground tabular-nums">
            Showing {count((paging.page - 1) * paging.limit + 1)}–{count((paging.page - 1) * paging.limit + rows.products.length)} of {count(paging.total)}
          </p>
          {paging.totalPages > 1 ? (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={at <= 1} onClick={() => turn(at - 1)}>
                <ChevronLeft aria-hidden="true" />
                Previous
              </Button>
              {/* Page numbers from sm up; a phone gets "3 of 28" between the arrows. */}
              <span className="px-2 text-sm text-muted-foreground tabular-nums sm:hidden">
                {at} of {paging.totalPages}
              </span>
              <span className="hidden items-center gap-1 sm:flex">
                {pageItems(at, paging.totalPages).map((it, i) =>
                  it === "gap" ? (
                    <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <Button
                      key={it}
                      size="sm"
                      variant={it === at ? "default" : "ghost"}
                      aria-label={`Page ${it}`}
                      aria-current={it === at ? "page" : undefined}
                      className="min-w-9 tabular-nums"
                      onClick={() => it !== at && turn(it)}
                    >
                      {it}
                    </Button>
                  ),
                )}
              </span>
              <Button variant="outline" size="sm" disabled={at >= paging.totalPages} onClick={() => turn(at + 1)}>
                Next
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          <label className="flex shrink-0 items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
            Rows per page
            <select value={limit} onChange={(e) => go({ limit: Number(e.target.value), page: 1 })} className={cn(selectClass, "w-auto")}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </nav>
      ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title="Products"
        actions={
          <>
            {data?.source && lastSync && !lastSync.error && !syncing ? (
              <span className="self-center text-sm text-muted-foreground">Synced {timeAgo(lastSync.at)}</span>
            ) : null}
            {canEdit ? (
            <>
              {data?.source ? (
                <Button variant="outline" onClick={syncNow} disabled={syncing}>
                  <RefreshCw aria-hidden="true" />
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
              ) : null}
              <Button onClick={() => setEditing("new")}>Add product</Button>
            </>
            ) : null}
          </>
        }
      >
        {data ? (
          <>
            {data.source ? SOURCE_LINE[data.source] : "No synced source"}
          </>
        ) : null}
      </PageHeader>
      {lastSync?.error && !syncing ? (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {lastSync.error} <span className="text-muted-foreground">({timeAgo(lastSync.at)})</span>
        </p>
      ) : null}
      <p aria-live="polite" className="text-sm text-destructive empty:hidden">{error}</p>
      {/* Campaigns pick products, so they wait until there are some. */}
      {data?.products.length ? <CampaignsSection workspaceId={workspaceId} brandId={brandId} products={data.products} canManage={canManageCommercial} /> : null}
      {inCard ? (
        <PageSection id="catalogue" title="Catalogue">
          {body}
        </PageSection>
      ) : (
        body
      )}
      {editing !== null ? (
        <ProductDialog
          workspaceId={workspaceId}
          brandId={brandId}
          product={editing === "new" ? null : editing}
          canVouch={canVouch}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAll();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete ${removing?.title ?? ""}?`}
        description="This removes the product you added by hand. It can't be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          await productsApi.remove(workspaceId, brandId, removing!.id);
          reloadAll();
        }}
      />
    </div>
  );
}

const PERSON = [
  ["materials", "Materials"],
  ["dimensions", "Dimensions"],
  ["certifications", "Certifications"],
] as const;
const STORE_TEXT = [
  ["title", "Name"],
  ["sku", "SKU"],
  ["category", "Category"],
  ["url", "Product link"],
  ["imageUrl", "Image link"],
] as const;
type FieldKey = (typeof PERSON)[number][0] | (typeof STORE_TEXT)[number][0] | "description" | "price" | "currency" | "stock";

/** Edit a product: the person-owned fields on a synced row, every field on one added by hand. */
function ProductDialog({
  workspaceId,
  brandId,
  product,
  canVouch,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  brandId: string;
  product: FullProduct | null;
  canVouch: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const manual = !product || product.source === "MANUAL";
  const [form, setForm] = useState<Record<FieldKey, string>>(() => ({
    title: product?.title ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? "",
    url: product?.url ?? "",
    imageUrl: product?.imageUrl ?? "",
    description: product?.description ?? "",
    materials: product?.materials ?? "",
    dimensions: product?.dimensions ?? "",
    certifications: product?.certifications ?? "",
    price: product?.price ?? "",
    currency: product?.currency ?? "",
    stock: product?.inStock === null || product?.inStock === undefined ? "" : product.inStock ? "yes" : "no",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Stock, price and facts are left out without rules.approve: the server refuses them, even unchanged.
    const body: Record<string, unknown> = canVouch ? Object.fromEntries(PERSON.map(([k]) => [k, form[k]])) : {};
    if (manual) {
      for (const [k] of STORE_TEXT) body[k] = form[k];
      body.description = form.description;
      body.currency = form.currency.trim() || null;
      if (canVouch) {
        body.price = form.price.trim() ? Number(form.price.replace(",", ".")) : null;
        if (body.price !== null && !Number.isFinite(body.price)) return setError("Enter the price as a number, like 29.90.");
        // Sent only when changed: saving stock stamps "checked just now".
        const inStock = form.stock === "" ? null : form.stock === "yes";
        if (inStock !== (product?.inStock ?? null)) body.inStock = inStock;
      }
    }
    setBusy(true);
    setError(null);
    try {
      if (product) await productsApi.update(workspaceId, brandId, product.id, body);
      else await productsApi.create(workspaceId, brandId, body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the product."));
      setBusy(false);
    }
  }

  const field = (k: FieldKey, label: string, props: React.ComponentProps<"input"> = {}) => (
    <label key={k} className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input value={form[k]} onChange={set(k)} {...props} />
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? product.title : "Add a product"}</DialogTitle>
          <DialogDescription>
            {manual
              ? "Agents use these details when they write about the product."
              : "Name, price and stock come from your store and update on each sync. Add what the store doesn't say."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {manual ? (
            <>
              {field("title", "Name", { required: true, maxLength: 300 })}
              <div className="grid gap-4 sm:grid-cols-2">
                {field("sku", "SKU", { maxLength: 100 })}
                {field("category", "Category", { maxLength: 120 })}
                {field("price", "Price", { inputMode: "decimal", placeholder: "29.90", disabled: !canVouch })}
                {field("currency", "Currency", { maxLength: 3, placeholder: "EUR" })}
              </div>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Stock</span>
                <select value={form.stock} onChange={set("stock")} disabled={!canVouch} className={selectClass}>
                  <option value="">Unknown</option>
                  <option value="yes">In stock</option>
                  <option value="no">Out of stock</option>
                </select>
              </label>
              {field("url", "Product link", { type: "url", maxLength: 2000, placeholder: "https://" })}
              {field("imageUrl", "Image link", { type: "url", maxLength: 2000, placeholder: "https://" })}
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Description</span>
                <Textarea value={form.description} onChange={set("description")} maxLength={5000} />
              </label>
            </>
          ) : null}
          {PERSON.map(([k, label]) => field(k, label, { maxLength: 1000, disabled: !canVouch }))}
          {canVouch ? null : (
            <p className="text-sm text-muted-foreground">Stock, price and product facts can only be changed by someone who can approve product claims.</p>
          )}
          <p aria-live="polite" className="text-sm text-destructive empty:hidden">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || (!manual && !canVouch)}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
