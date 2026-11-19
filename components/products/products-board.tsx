"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { productsApi, stockLabel, thumbUrl, type FullProduct, type Product } from "@/components/products/api";
import { CampaignsSection } from "@/components/products/campaigns";
import { errorMessage } from "@/components/settings/api";
import { ConfirmDialog, ListSkeleton, LoadError, selectClass, useLoad } from "@/components/settings/shared";
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
// ponytail: the whole catalogue loads once and is searched here, 50 rows drawn at a time; page on the server past a few thousand.
const PAGE = 50;
const count = (n: number) => n.toLocaleString();
/** What "In stock" in the filter means: the same as stockLabel's in-stock wordings. */
const inStock = (p: Product) => (p.stockQuantity !== null && p.stockQuantity > 0) || (p.stockQuantity === null && p.inStock === true);

export function ProductsBoard({ workspaceId, brandId, canEdit, canVouch, canManageCommercial }: Props) {
  const fetcher = useCallback(() => productsApi.list(workspaceId, brandId), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const [editing, setEditing] = useState<FullProduct | "new" | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stock, setStock] = useState<"" | "in" | "out">("");
  const [limit, setLimit] = useState(PAGE);

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
        reload();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [syncing, workspaceId, brandId, reload]);

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
    const q = query.trim().toLowerCase();
    const all = state.data.products;
    const matches = all.filter(
      (p) => (!q || p.title.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)) && (!stock || (stock === "in") === inStock(p)),
    );
    body = (
      <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          aria-label="Search products"
          placeholder="Search by name or SKU"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          className="w-full sm:max-w-xs"
        />
        <select
          aria-label="Filter by stock"
          value={stock}
          onChange={(e) => {
            setStock(e.target.value as typeof stock);
            setLimit(PAGE);
          }}
          className={cn(selectClass, "w-full sm:w-auto")}
        >
          <option value="">All stock</option>
          <option value="in">In stock</option>
          <option value="out">Out of stock or unknown</option>
        </select>
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {matches.length === all.length ? `${count(all.length)} products` : `${count(matches.length)} of ${count(all.length)} products`}
        </p>
      </div>
      {/* Scrolls inside the card so the column heads stay in view over a long catalogue. */}
      <div className="-mx-5 max-h-[calc(100dvh-14rem)] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-3 sm:px-5 font-medium">Product</th>
              <th scope="col" className="hidden px-3 py-3 sm:px-5 font-medium md:table-cell">SKU</th>
              <th scope="col" className="px-3 py-3 sm:px-5 text-right font-medium">Price</th>
              <th scope="col" className="px-3 py-3 sm:px-5 font-medium">Stock</th>
              {canEdit ? <th scope="col" className="px-3 py-3 sm:px-5"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {matches.slice(0, limit).map((p) => (
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
                  <td className="px-3 py-2 sm:px-5 text-right whitespace-nowrap">
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
      {matches.length > limit ? (
        <Button variant="outline" className="self-center" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, matches.length - limit)} more
        </Button>
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
            reload();
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
          reload();
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
