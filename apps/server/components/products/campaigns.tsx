"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { campaignsApi, type Campaign, type CampaignBody, type CampaignKind, type Product } from "@/components/products/api";
import { errorMessage } from "@/components/settings/api";
import { ConfirmDialog, ListSkeleton, LoadError, selectClass, useLoad } from "@/components/settings/shared";
import { byExternalId, groupKey, offerPercents, productName, REMOVED_PRODUCT_NAME, zoneCity } from "@espanda/shared";

const KIND_LABEL: Record<CampaignKind, string> = { priority: "Standing priority", campaign: "Campaign", offer: "Offer" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const terms = (c: Pick<Campaign, "discountPercent" | "code">) => [c.discountPercent ? `-${c.discountPercent} %` : null, c.code ? `code ${c.code}` : null].filter(Boolean).join(" · ");

/**
 * "Campaigns and offers" on the products page (docs/superpowers/specs/2026-11-05-offers-campaigns-design.md, Web
 * screen): standing priorities, then live and upcoming, then ended in the last 30 days (the route leaves archived and
 * older ones out). Times are wall-clock in the brand timezone. Editing needs commercial.manage (`canManage`).
 */
export function CampaignsSection({ workspaceId, brandId, products, canManage }: { workspaceId: string; brandId: string; products: Product[]; canManage: boolean }) {
  const fetcher = useCallback(() => campaignsApi.list(workspaceId, brandId), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [withdrawing, setWithdrawing] = useState<Campaign | null>(null);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // One row per variant group, the representative (first by externalId) being the id posts store.
  const groups = useMemo(() => {
    const byKey = new Map<string, Product[]>();
    for (const p of products) byKey.set(groupKey(p), [...(byKey.get(groupKey(p)) ?? []), p]);
    return [...byKey.values()].map((g) => [...g].sort(byExternalId)[0]!).map((rep) => ({ id: rep.id, name: productName(rep.title) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);
  const categories = useMemo(() => [...new Set(products.flatMap((p) => (p.category ? [p.category] : [])))].sort(), [products]);

  const held = (c: Campaign, verb: string) =>
    setNotice(c.affectedPosts.length ? `${c.name} ${verb}. ${plural(c.affectedPosts.length, "post")} use it; if their offer changed, they're held until rewritten.` : `${c.name} ${verb}.`);

  if (state.kind === "loading") return <ListSkeleton label="Loading campaigns" />;
  if (state.kind === "forbidden") return null;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;
  const { timeZone } = state.data;
  const now = Date.now();
  const ended = (c: Campaign) => c.endsAt !== null && new Date(c.endsAt).getTime() <= now;
  const list = [
    ...state.data.campaigns.filter((c) => c.endsAt === null),
    ...state.data.campaigns.filter((c) => c.endsAt !== null && !ended(c)),
    ...state.data.campaigns.filter(ended),
  ];

  return (
    <section aria-labelledby="campaigns-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="campaigns-h" className="font-display text-lg font-semibold">Campaigns and offers</h2>
          <p className="text-sm text-muted-foreground">
            {timeZone ? `Times are in ${zoneLabel(timeZone)}.` : "No timezone set yet: it's asked for on the first save."}{" "}
            {canManage && timeZone ? (
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setZoneOpen(true)}>Change</button>
            ) : null}
          </p>
        </div>
        {canManage ? <Button onClick={() => setEditing("new")}>New campaign</Button> : null}
      </div>
      <p aria-live="polite" className="text-sm empty:hidden">{notice}</p>
      {list.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {c.name} <span className="font-normal text-muted-foreground">· {KIND_LABEL[c.kind]}{ended(c) ? " · ended" : ""}</span>
                </p>
                <p className="text-muted-foreground tabular-nums">{c.ends ? `${c.starts} – ${c.ends}` : `From ${c.starts}, ongoing`}</p>
                {c.offer ? <p>{[c.offer, terms(c)].filter(Boolean).join(" · ")}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {[c.productIds.length ? plural(c.productIds.length, "product") : null, c.categories.length ? c.categories.join(", ") : null].filter(Boolean).join(" · ") || "Whole catalogue"}
                  {c.affectedPosts.length ? ` · ${plural(c.affectedPosts.length, "post")} in progress` : ""}
                </p>
              </div>
              {canManage ? (
                <div className="whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setWithdrawing(c)}>Withdraw</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No campaigns, offers or standing priorities yet.</p>
      )}
      <p className="text-xs text-muted-foreground">New campaigns are planned at the next Generate calendar run. Someone who can run agents can run it now.</p>
      {editing !== null ? (
        <CampaignDialog
          campaign={editing === "new" ? null : editing}
          timeZone={timeZone}
          groups={groups}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={async (body, zone) => {
            if (zone) await campaignsApi.setTimeZone(workspaceId, brandId, zone);
            const { campaign } = editing === "new" ? await campaignsApi.create(workspaceId, brandId, body) : await campaignsApi.update(workspaceId, brandId, editing.id, body);
            setEditing(null);
            held(campaign, "saved");
            reload();
          }}
        />
      ) : null}
      {zoneOpen && timeZone ? (
        <ZoneDialog
          current={timeZone}
          onClose={() => setZoneOpen(false)}
          onSave={async (zone) => {
            await campaignsApi.setTimeZone(workspaceId, brandId, zone);
            setZoneOpen(false);
            reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(open) => !open && setWithdrawing(null)}
        title={`Withdraw ${withdrawing?.name ?? ""}?`}
        description={`Posts stop using it.${withdrawing?.affectedPosts.length ? ` ${plural(withdrawing.affectedPosts.length, "post")} that use it are held until they're rewritten.` : ""} History keeps it.`}
        confirmLabel="Withdraw"
        onConfirm={async () => {
          const { campaign } = await campaignsApi.withdraw(workspaceId, brandId, withdrawing!.id);
          held(campaign, "withdrawn");
          reload();
        }}
      />
    </section>
  );
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "Europe/Paris" → "Paris (Central European Time)"; the city alone when Intl has no name for the zone. */
function zoneLabel(timeZone: string) {
  const city = zoneCity(timeZone);
  let name: string | undefined;
  try {
    name = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longGeneric" }).formatToParts(Date.now()).find((p) => p.type === "timeZoneName")?.value;
  } catch {
    // An id this browser doesn't know: the city is still readable.
  }
  return name && name !== city ? `${city} (${name})` : city;
}

/** Every zone the browser knows, by readable name; the current one kept even when it's an alias ("Asia/Calcutta"). */
function ZoneSelect({ value, onChange, label }: { value: string; onChange: (zone: string) => void; label?: string }) {
  const [zones] = useState(() =>
    [...new Set([value, ...Intl.supportedValuesOf("timeZone")])].map((id) => ({ id, label: zoneLabel(id) })).sort((a, b) => a.label.localeCompare(b.label)),
  );
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} required className={selectClass}>
      {zones.map((z) => (
        <option key={z.id} value={z.id}>{z.label}</option>
      ))}
    </select>
  );
}

/** Lists show 24-hour times, so the dialog takes them the same way (a native time input follows the browser's 12/24 h). */
const timeProps = { pattern: "([01][0-9]|2[0-3]):[0-5][0-9]", placeholder: "HH:MM", maxLength: 5, title: "24-hour time, like 09:00 or 20:00" };

/** "2026-11-30 20:00" → ["2026-11-30", "20:00"]. */
const split = (wall: string | null | undefined, time: string) => (wall ? [wall.slice(0, 10), wall.slice(11, 16)] : ["", time]);

function CampaignDialog({
  campaign,
  timeZone,
  groups,
  categories,
  onClose,
  onSave,
}: {
  campaign: Campaign | null;
  timeZone: string | null;
  groups: { id: string; name: string }[];
  categories: string[];
  onClose: () => void;
  /** `zone`: set the brand timezone first (the first save). */
  onSave: (body: CampaignBody, zone: string | null) => Promise<void>;
}) {
  const [kind, setKind] = useState<CampaignKind>(campaign?.kind ?? "offer");
  const [name, setName] = useState(campaign?.name ?? "");
  const [[startDate, startTime], setStart] = useState(() => split(campaign?.starts, "00:00"));
  const [[endDate, endTime], setEnd] = useState(() => split(campaign?.ends, "23:59"));
  const [productIds, setProductIds] = useState<string[]>(campaign?.productIds ?? []);
  const [picked, setPicked] = useState<string[]>(campaign?.categories ?? []);
  const [offer, setOffer] = useState(campaign?.offer ?? "");
  const [percent, setPercent] = useState(campaign?.discountPercent ? String(campaign.discountPercent) : "");
  const [code, setCode] = useState(campaign?.code ?? "");
  const [zone, setZone] = useState(timeZone ? null : browserZone());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Saved ids with no loaded row (archived since, or a store switch) stay ticked so an unrelated edit keeps them.
  const known = new Set(groups.map((g) => g.id));
  const rows = [...groups, ...(campaign?.productIds ?? []).filter((id) => !known.has(id)).map((id) => ({ id, name: REMOVED_PRODUCT_NAME }))];
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = q ? rows.filter((p) => p.name.toLowerCase().includes(q)) : rows;
  // Quality accepts the discount % or any percent in the wording, so a mismatch lets posts say either one.
  const pctValue = Number(percent);
  const worded = kind === "offer" && percent.trim() && Number.isInteger(pctValue) ? [...new Set(offerPercents(offer))].filter((n) => n !== pctValue) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pct = percent.trim() ? Number(percent) : null;
    if (pct !== null && !(Number.isInteger(pct) && pct >= 1 && pct <= 90)) return setError("The discount is a whole number from 1 to 90.");
    const isOffer = kind === "offer";
    const body: CampaignBody = {
      name,
      startsAt: `${startDate}T${startTime || "00:00"}`,
      endsAt: kind === "priority" ? null : `${endDate}T${endTime || "23:59"}`,
      productIds,
      categories: picked,
      offer: isOffer ? offer : null,
      discountPercent: isOffer ? pct : null,
      code: isOffer && code.trim() ? code : null,
    };
    setBusy(true);
    setError(null);
    try {
      await onSave(body, zone?.trim() || null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the campaign."));
      setBusy(false);
    }
  }

  const label = "flex flex-col gap-1.5 text-sm";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign ? `Edit ${campaign.name}` : "New campaign"}</DialogTitle>
          <DialogDescription>{timeZone ? `Times are in ${zoneLabel(timeZone)}.` : "Times are in the brand's timezone, set below."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {campaign?.affectedPosts.length ? (
            <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              {plural(campaign.affectedPosts.length, "post")} use{campaign.affectedPosts.length === 1 ? "s" : ""} this. Changing the discount, code or wording, shortening the times, removing
              products or categories, or withdrawing it holds them until they&rsquo;re rewritten.
            </p>
          ) : null}
          {zone !== null ? (
            <label className={label}>
              <span className="text-muted-foreground">Brand timezone (campaign times are entered and shown in it)</span>
              <ZoneSelect value={zone} onChange={setZone} />
            </label>
          ) : null}
          <label className={label}>
            <span className="text-muted-foreground">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as CampaignKind)} className={selectClass}>
              <option value="offer">Offer: a discount or deal with dates</option>
              <option value="campaign">Campaign: a launch, a season, a push with dates</option>
              <option value="priority">Standing priority: no end date</option>
            </select>
          </label>
          <label className={label}>
            <span className="text-muted-foreground">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1.5 text-sm text-muted-foreground">Starts</legend>
            <Input type="date" aria-label="Start date" value={startDate} onChange={(e) => setStart([e.target.value, startTime])} required />
            <Input aria-label="Start time" value={startTime} onChange={(e) => setStart([startDate, e.target.value])} {...timeProps} />
          </fieldset>
          {kind !== "priority" ? (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1.5 text-sm text-muted-foreground">Ends</legend>
              <Input type="date" aria-label="End date" value={endDate} onChange={(e) => setEnd([e.target.value, endTime])} required />
              <Input aria-label="End time" value={endTime} onChange={(e) => setEnd([endDate, e.target.value])} {...timeProps} />
              <p className="text-xs text-muted-foreground sm:col-span-2">Over at that minute: &ldquo;until 20:00&rdquo; ends at 20:00, and 23:59 leaves the day&rsquo;s last minute out.</p>
            </fieldset>
          ) : null}
          {kind === "offer" ? (
            <>
              <label className={label}>
                <span className="text-muted-foreground">What customers get, and its conditions</span>
                <Textarea value={offer} onChange={(e) => setOffer(e.target.value)} required maxLength={500} rows={2} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={label}>
                  <span className="text-muted-foreground">Discount % (optional)</span>
                  <Input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="numeric" placeholder="20" />
                </label>
                <label className={label}>
                  <span className="text-muted-foreground">Code (optional)</span>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
                </label>
              </div>
              {worded.length ? (
                <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                  The wording says {worded.map((n) => `${n} %`).join(", ")} but the discount is {pctValue} %. Posts may use either one, so make them match.
                </p>
              ) : null}
            </>
          ) : null}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm text-muted-foreground">Products and categories (none ticked: the whole catalogue)</legend>
            {categories.length ? (
              <div className="flex flex-wrap gap-x-4">
                {categories.map((c) => (
                  <label key={c} className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" checked={picked.includes(c)} onChange={() => setPicked((l) => toggle(l, c))} className="size-4 accent-primary" />
                    {c}
                  </label>
                ))}
              </div>
            ) : null}
            {rows.length > 8 ? (
              <Input type="search" aria-label="Search products" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
            ) : null}
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
              {shown.length ? (
                shown.map((p) => (
                  <label key={p.id} className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" checked={productIds.includes(p.id)} onChange={() => setProductIds((l) => toggle(l, p.id))} className="size-4 accent-primary" />
                    {p.name}
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{rows.length ? "No product matches." : "No products in the catalogue yet."}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{productIds.length ? `${plural(productIds.length, "product")} ticked. ` : ""}Up to 50 products and 20 categories.</p>
          </fieldset>
          <p aria-live="polite" className="text-sm text-destructive empty:hidden">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ZoneDialog({ current, onClose, onSave }: { current: string; onClose: () => void; onSave: (zone: string) => Promise<void> }) {
  const [zone, setZone] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Brand timezone</DialogTitle>
          <DialogDescription>
            Campaign times are entered and shown in it. Existing campaigns keep their moments and then read in the new zone (a 20:00 Paris end shows as 14:00 in Montreal).
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await onSave(zone.trim());
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          <ZoneSelect label="Timezone" value={zone} onChange={setZone} />
          <p aria-live="polite" className="text-sm text-destructive empty:hidden">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
