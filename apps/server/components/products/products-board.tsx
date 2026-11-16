"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { productsApi, stockLabel, thumbUrl, type FullProduct, type Product } from "@/components/products/api";
import { CampaignsSection } from "@/components/products/campaigns";
import { errorMessage } from "@/components/settings/api";
import { ConfirmDialog, ListSkeleton, LoadError, selectClass, useLoad } from "@/components/settings/shared";
import { timeAgo } from "@/lib/time";

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

export function ProductsBoard({ workspaceId, brandId, canEdit, canVouch, canManageCommercial }: Props) {
  const fetcher = useCallback(() => productsApi.list(workspaceId, brandId), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const [editing, setEditing] = useState<FullProduct | "new" | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
    const matches = q ? state.data.products.filter((p) => p.title.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)) : state.data.products;
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
          className="max-w-xs"
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {matches.length === state.data.products.length ? `${matches.length} products` : `${matches.length} of ${state.data.products.length} products`}
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Product</th>
              <th scope="col" className="px-5 py-3 font-medium">SKU</th>
              <th scope="col" className="px-5 py-3 font-medium">Price</th>
              <th scope="col" className="px-5 py-3 font-medium">Stock</th>
              <th scope="col" className="px-5 py-3 font-medium">Product facts</th>
              {canEdit ? <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {matches.slice(0, limit).map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- store images come from any host; next/image needs each one allowed
                      <img src={thumbUrl(p.imageUrl, 80)} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg bg-muted object-cover" />
                    ) : (
                      <span className="size-10 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
                          {p.title}
                        </a>
                      ) : (
                        <p className="font-medium text-foreground">{p.title}</p>
                      )}
                      {p.source === "MANUAL" ? <p className="text-xs text-muted-foreground">Added by hand</p> : null}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{p.sku ?? "—"}</td>
                <td className="px-5 py-3 whitespace-nowrap tabular-nums">{price(p)}</td>
                <td className="px-5 py-3">
                  <p className="whitespace-nowrap">{stockLabel(p)}</p>
                  {p.stockCheckedAt ? <p className="text-xs whitespace-nowrap text-muted-foreground">checked {timeAgo(p.stockCheckedAt)}</p> : null}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {p.materials || p.dimensions ? (
                    <>
                      {p.materials ? <p>{p.materials}</p> : null}
                      {p.dimensions ? <p className="text-xs">{p.dimensions}</p> : null}
                    </>
                  ) : (
                    <span>Not added yet</span>
                  )}
                </td>
                {canEdit ? (
                  <td className="px-5 py-3 text-right whitespace-nowrap">
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
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl leading-[30px] font-semibold tracking-tight">Products</h1>
          {data ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {data.source ? SOURCE_LINE[data.source] : "No synced source"}
              {syncing
                ? " · Syncing…"
                : lastSync && !lastSync.error && lastSync.source
                  ? ` · Last synced ${timeAgo(lastSync.at)}, ${lastSync.count} product${lastSync.count === 1 ? "" : "s"}`
                  : ""}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            {data?.source ? (
              <Button variant="outline" onClick={syncNow} disabled={syncing}>
                <RefreshCw aria-hidden="true" />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            ) : null}
            <Button onClick={() => setEditing("new")}>Add product</Button>
          </div>
        ) : null}
      </div>
      {lastSync?.error && !syncing ? (
        <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {lastSync.error} <span className="text-muted-foreground">({timeAgo(lastSync.at)})</span>
        </p>
      ) : null}
      <p aria-live="polite" className="text-sm text-destructive empty:hidden">{error}</p>
      {data ? <CampaignsSection workspaceId={workspaceId} brandId={brandId} products={data.products} canManage={canManageCommercial} /> : null}
      {body}
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
