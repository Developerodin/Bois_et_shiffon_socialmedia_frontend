"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Plug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSection } from "@/components/ui/page-section";
import { Input } from "@/components/ui/input";
import {
  errorMessage,
  settingsApi,
  type Connection,
  type Provider,
  type ProviderInfo,
} from "@/components/settings/api";
import { CONNECT_RETURN_KEY, connectReturnPath } from "@/lib/connect-return";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ConfirmDialog,
  ListSkeleton,
  LoadError,
  formatDate,
  useLoad,
} from "@/components/settings/shared";

const PURPOSE: Record<Provider, string> = {
  META: "Publish to your Facebook Pages and read Page insights.",
  INSTAGRAM: "Publish to your Instagram professional account and read its insights.",
  THREADS: "Publish to Threads and read post insights.",
  GOOGLE: "Read website traffic (Analytics) and search queries (Search Console).",
  GOOGLE_BUSINESS: "Read and reply to Google reviews, and post updates to your Google Business Profile.",
  REDDIT: "Find relevant conversations and post approved replies.",
  PINTEREST: "Publish approved Pins to your boards and read saves and clicks.",
  SHOPIFY: "Sync your products, prices and stock from your Shopify store.",
  META_ADS: "Read ad spend, purchases and ROAS from your Meta ad accounts. Its own login, asking for ad reading only.",
};

type Props = {
  workspaceId: string;
  brandId: string;
  canManage: boolean;
  /** Result of the OAuth round-trip, read from the URL by the parent. */
  notice: { kind: "ok" | "error"; text: string; names?: string[] } | null;
  /** The `ads` flag: only then is the Meta Ads card listed. */
  showAds?: boolean;
};

export function ConnectionsTab({ workspaceId, brandId, canManage, notice, showAds = false }: Props) {
  const fetcher = useCallback(() => settingsApi.connections(workspaceId, brandId), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const router = useRouter();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [shown, setShown] = useState(notice);
  // Hide a disconnected account at once; the list refetch from the database can take seconds.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const fresh = new Set(shown?.kind === "ok" ? shown.names : []);

  // A "Connected X" banner is only true if the list agrees: wait for the list, and say so when an account isn't there.
  let banner: { kind: "ok" | "error"; text: string } | null = error ? { kind: "error", text: error } : shown;
  if (!error && shown?.kind === "ok" && shown.names) {
    if (state.kind === "loading") banner = null;
    else if (state.kind === "ready") {
      const missing = shown.names.filter((n) => !state.data.connections.some((c) => c.displayName === n && c.status === "ACTIVE"));
      if (missing.length)
        banner = { kind: "error", text: `${missing.join(", ")} did not show up as connected. Press Connect to try again.` };
    }
  }

  // The OAuth result arrives as one-time URL params; drop them so a refresh or a shared link
  // doesn't replay the message.
  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    // The callback lands on Settings. If Connect started on the Connections page, go back there with the same result.
    // The remembered value is removed after one read, so a refresh does not bounce again.
    if (url.pathname === "/settings") {
      let back: "/connections" | null = null;
      try {
        back = connectReturnPath(window.sessionStorage.getItem(CONNECT_RETURN_KEY));
        window.sessionStorage.removeItem(CONNECT_RETURN_KEY);
      } catch {
        /* storage blocked: stay on Settings */
      }
      if (back) {
        url.searchParams.delete("tab");
        router.replace(`${back}${url.search}`);
        return;
      }
    }
    url.searchParams.delete("connected");
    url.searchParams.delete("connectError");
    window.history.replaceState(window.history.state, "", url);
  }, [notice, router]);

  async function connect({ provider, kind }: ProviderInfo) {
    if (kind === "token") return setShopifyOpen(true);
    setBusy(provider);
    setError(null);
    try {
      try {
        window.sessionStorage.setItem(CONNECT_RETURN_KEY, window.location.pathname);
      } catch {
        /* storage blocked: the callback lands on Settings as before */
      }
      const { url } = await settingsApi.startConnect(workspaceId, brandId, provider);
      window.location.assign(url); // full-page redirect to the provider's consent screen
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  // Empty and error states are boxes of their own, so only the skeleton and the list go in the card.
  const inCard = state.kind === "loading" || state.kind === "ready";
  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading connections" />;
  else if (state.kind === "forbidden")
    body = <EmptyState icon={Plug} title="You can't see this brand's connections" description="Your role doesn't include access to this brand." />;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else
    body = (
      <ul className="-mx-5 divide-y divide-border">
        {state.data.providers.filter((p) => showAds || p.provider !== "META_ADS").map((p) => {
          const accounts = state.data.connections.filter((c) => c.provider === p.provider && !gone.has(c.id));
          return (
            <li key={p.provider} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{p.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{PURPOSE[p.provider]}</p>
                </div>
                {!p.configured ? (
                  <div className="flex flex-col items-end gap-1 text-right">
                    <StatusBadge tone="muted">Not set up</StatusBadge>
                    <span className="text-xs text-muted-foreground">Needs app keys on the server. Ask your platform admin.</span>
                  </div>
                ) : canManage ? (
                  <Button
                    size="sm"
                    variant={accounts.length ? "outline" : "default"}
                    onClick={() => connect(p)}
                    disabled={busy !== null}
                  >
                    {busy === p.provider ? "Opening…" : accounts.length ? "Reconnect" : "Connect"}
                  </Button>
                ) : null}
              </div>
              {accounts.map((c) => (
                <div
                  key={c.id}
                  className={
                    fresh.has(c.displayName) && c.status === "ACTIVE"
                      ? "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/50 bg-success/10 px-4 py-2.5"
                      : "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-transparent bg-muted/40 px-4 py-2.5"
                  }
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusBadge tone={c.status === "ACTIVE" ? "good" : "bad"}>
                      {c.status === "ACTIVE" ? "Connected" : "Needs reconnect"}
                    </StatusBadge>
                    <span className="truncate text-sm">{c.displayName}</span>
                    {c.via === "mcp" ? <span className="text-xs text-muted-foreground">Shopify MCP · products only</span> : null}
                    <span className="text-xs text-muted-foreground">
                      {fresh.has(c.displayName) && c.status === "ACTIVE" ? "just now" : `since ${formatDate(c.connectedAt)}`}
                    </span>
                  </div>
                  {c.status !== "ACTIVE" && (
                    <p className="basis-full text-xs text-muted-foreground">
                      {c.lastError ?? "This account's access stopped working."}
                      {c.provider === "SHOPIFY" || c.provider === "META_ADS" ? "" : " Posts to it fail until you press Reconnect."}
                    </p>
                  )}
                  {canManage && (
                    <div className="flex gap-2">
                      {c.status === "ERROR" && p.configured && (
                        <Button size="sm" onClick={() => connect(p)} disabled={busy !== null}>
                          {busy === c.provider ? "Opening…" : "Reconnect"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(c)}>
                        Disconnect
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="flex flex-col gap-5">
      {banner && (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          className={
            banner.kind === "ok"
              ? "flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm"
              : "flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
          }
        >
          {banner.kind === "ok" ? (
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          )}
          <p className="flex-1">
            {banner.text}
            {banner.kind === "ok" && shown?.names && " Agents can now use this account for this brand."}
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setShown(null);
              setError(null);
            }}
            className="-m-2 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      <PageSection
        id="connections"
        title="Connected accounts"
        description="This brand's own channel accounts. Tokens are stored encrypted and never shown."
        className={state.kind === "ready" ? "pb-0" : undefined}
      >
        {inCard ? body : null}
      </PageSection>
      {inCard ? null : body}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Disconnect ${removing?.displayName ?? ""}?`}
        description={
          removing?.provider === "SHOPIFY"
            ? "Products stop syncing from this store; the next sync reads your website's product feed instead. You can reconnect any time."
            : "Agents will stop publishing to and reading from this account, and posts scheduled to it are cancelled (they stay approved, ready to schedule again). You can reconnect any time."
        }
        confirmLabel="Disconnect"
        onConfirm={async () => {
          const c = removing!;
          const { cancelled } = await settingsApi.disconnect(workspaceId, brandId, c.id);
          setGone((g) => new Set(g).add(c.id));
          setError(null);
          setShown({
            kind: "ok",
            text: `Disconnected ${c.displayName}. Agents will no longer use it.${cancelled ? ` ${cancelled} scheduled post${cancelled === 1 ? " was" : "s were"} cancelled; schedule ${cancelled === 1 ? "it" : "them"} again from the calendar.` : ""}`,
          });
          reload();
        }}
      />
      {shopifyOpen ? (
        <ShopifyDialog
          workspaceId={workspaceId}
          brandId={brandId}
          askCart={state.kind === "ready" ? (state.data.providers.find((p) => p.provider === "SHOPIFY")?.askCart ?? null) : null}
          mcp={state.kind === "ready" ? (state.data.providers.find((p) => p.provider === "SHOPIFY")?.mcp ?? false) : false}
          onClose={() => setShopifyOpen(false)}
          onConnected={(name, warning) => {
            setShopifyOpen(false);
            setError(null);
            setShown({ kind: "ok", text: `Connected ${name}. Its products sync in a minute.${warning ? ` ${warning}` : ""}`, names: [name] });
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Connect Shopify. Two ways: (1) our app, AskCart, when the platform is linked to it (`askCart`): per-brand asks for the
 * store's address and goes to AskCart's connect page (it comes back to Connections); single-store (interim) connects
 * with one press. (2) Shopify MCP, when the platform has a public agent profile (`mcp`): the store's address only, no
 * install; products only (orders need AskCart). Below them, a custom app's Admin API token.
 */
function ShopifyDialog({
  workspaceId,
  brandId,
  askCart,
  mcp,
  onClose,
  onConnected,
}: {
  workspaceId: string;
  brandId: string;
  askCart: "per-brand" | "single-store" | null;
  mcp: boolean;
  onClose: () => void;
  onConnected: (name: string, warning?: string) => void;
}) {
  const [shop, setShop] = useState("");
  const [askCartShop, setAskCartShop] = useState("");
  const [mcpShop, setMcpShop] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorMessage(err, fallback));
      setBusy(false);
    }
  }

  function submitToken(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { connection } = await settingsApi.connectShopify(workspaceId, brandId, { shop, accessToken });
      onConnected(connection.displayName);
    }, "Couldn't connect Shopify.");
  }

  function connectAskCart(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const res = await settingsApi.connectAskCart(workspaceId, brandId, askCart === "per-brand" ? askCartShop : undefined);
      if (res.url) {
        try {
          window.sessionStorage.setItem(CONNECT_RETURN_KEY, window.location.pathname);
        } catch {
          /* storage blocked: the callback lands on Settings */
        }
        window.location.assign(res.url); // AskCart's connect page; it sends the browser back to Connections
      } else if (res.connection) onConnected(res.connection.displayName);
    }, "Couldn't connect through AskCart.");
  }

  function connectMcp(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { connection, warning } = await settingsApi.connectShopifyMcp(workspaceId, brandId, mcpShop);
      onConnected(connection.displayName, warning);
    }, "Couldn't connect through Shopify MCP.");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Shopify</DialogTitle>
          <DialogDescription>Choose how this brand reads its Shopify store.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {askCart ? (
            <form onSubmit={connectAskCart} className="flex flex-col gap-3 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">Connect with our app (AskCart)</p>
                <p className="text-muted-foreground">
                  {askCart === "per-brand"
                    ? "You approve AskCart in your Shopify admin, then come back here. No token to copy."
                    : "Connects the store AskCart reads. No token to copy."}
                </p>
              </div>
              {askCart === "per-brand" ? (
                <Input
                  required
                  autoComplete="off"
                  value={askCartShop}
                  onChange={(e) => setAskCartShop(e.target.value)}
                  placeholder="your-store.myshopify.com"
                  maxLength={200}
                  aria-label="Store address"
                />
              ) : null}
              <Button type="submit" disabled={busy} className="self-start">
                {busy ? "Connecting…" : "Connect with AskCart"}
              </Button>
            </form>
          ) : null}
          {mcp ? (
            <form onSubmit={connectMcp} className="flex flex-col gap-3 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">Connect with Shopify MCP</p>
                <p className="text-muted-foreground">
                  Reads your products, prices and stock from your store&apos;s public catalogue. Nothing to install. Orders need our app
                  (AskCart).
                </p>
              </div>
              <Input
                required
                autoComplete="off"
                value={mcpShop}
                onChange={(e) => setMcpShop(e.target.value)}
                placeholder="your-store.myshopify.com or your shop's domain"
                maxLength={200}
                aria-label="Store address for Shopify MCP"
              />
              <Button type="submit" variant="outline" disabled={busy} className="self-start">
                {busy ? "Checking…" : "Connect with Shopify MCP"}
              </Button>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm opacity-60">
              <div>
                <p className="font-medium">Shopify MCP</p>
                <p className="text-muted-foreground">Not set up on this platform. Ask your platform admin.</p>
              </div>
              <Button type="button" variant="outline" disabled>
                Connect
              </Button>
            </div>
          )}
        </div>
        <form onSubmit={submitToken} className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Or use a custom app: in Shopify, go to Settings → Apps → Develop apps, create a custom app with the read_products
            and read_inventory Admin API scopes, install it, and paste its Admin API access token here.
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Store address</span>
            <Input required autoComplete="off" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="your-store.myshopify.com" maxLength={200} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Admin API access token</span>
            <Input required type="password" autoComplete="off" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="shpat_…" maxLength={200} />
          </label>
          <p aria-live="polite" className="text-sm text-destructive empty:hidden">
            {error}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Connect with token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
