"use client";

import { useCallback, useState } from "react";
import { Cpu, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { errorMessage, settingsApi, type AiModel, type AiModelSettings, type AiTierName } from "@/components/settings/api";
import { ConfirmDialog, ListSkeleton, LoadError, SectionHeader, StatusPill, selectClass, useLoad } from "@/components/settings/shared";

const TIER_INFO: Record<AiTierName, string> = {
  heavy: "Writing that shapes everything else or reaches customers: strategy documents, post drafts, the check before approval.",
  medium: "Reading, finding and structuring: online lookup, brand summary, ideas, audits, chat. New tasks start here.",
  light: "Short, low-stakes calls where a loose answer is fine. Nothing that quotes the brand.",
};

/**
 * Platform-wide AI models (platform admins only): which model each tier uses and every model's price. Changes apply
 * to all workspaces within a minute. Before moving a tier to a new model, run the test set against it
 * (npm run eval -w web -- --models <name>).
 */
export function AiModelsTab() {
  const fetcher = useCallback(() => settingsApi.aiModels(), []);
  const { state, reload } = useLoad(fetcher);
  // Saves return the fresh settings; show them without a reload flash.
  const [fresh, setFresh] = useState<AiModelSettings | null>(null);
  const [editing, setEditing] = useState<AiModel | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const data = fresh ?? (state.kind === "ready" ? state.data : null);

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading AI models" />;
  else if (state.kind === "forbidden") body = <EmptyState icon={Cpu} title="Platform admins only" description="AI models apply to every workspace, so only platform admins can change them." />;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else if (data)
    body = (
      <>
        <section aria-labelledby="tiers-heading" className="flex flex-col gap-3">
          <h3 id="tiers-heading" className="text-sm font-medium text-foreground">
            Tiers
          </h3>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            {data.tiers.map((t) => (
              <TierRow key={t.tier} tier={t} models={data.models.map((m) => m.name)} onSaved={setFresh} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="models-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id="models-heading" className="text-sm font-medium text-foreground">
              Models and prices <span className="font-normal text-muted-foreground">(USD per 1M tokens)</span>
            </h3>
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
              <Plus /> Add model
            </Button>
          </div>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            {data.models.map((m) => {
              const usedBy = data.tiers.filter((t) => t.model === m.name || t.backup === m.name).map((t) => `${t.tier}${t.backup === m.name ? " backup" : ""}`);
              return (
                <li key={m.name} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-foreground">{m.name}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>${m.inputUsdPerM} in</span>
                      <span>${m.cachedUsdPerM} cached</span>
                      <span>${m.outputUsdPerM} out</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {usedBy.length ? <StatusPill tone="good">{usedBy.join(", ")}</StatusPill> : null}
                    {m.evalCandidate ? <StatusPill tone="muted">Compared in tests</StatusPill> : null}
                    {m.judgeRank ? <StatusPill tone="muted">Judge {m.judgeRank}</StatusPill> : null}
                    {!m.cacheBreakpoints ? <StatusPill tone="muted">No cache breakpoints</StatusPill> : null}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}>
                      <Pencil />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(m.name)} disabled={usedBy.length > 0} aria-label={`Delete ${m.name}`} title={usedBy.length ? "In use by a tier" : undefined}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </>
    );

  return (
    <section aria-labelledby="ai-models-heading" className="flex flex-col gap-6">
      <SectionHeader
        id="ai-models-heading"
        title="AI models"
        description="Which model each tier uses, and what every model costs. This applies to all workspaces, within a minute. Test a model before moving a tier to it: npm run eval -w web -- --models <name>."
      />
      {body}
      {editing ? <ModelDialog model={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={setFresh} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this model?"
        description={deleting ? `${deleting} is removed from the list. Past usage keeps its recorded cost.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleting) setFresh(await settingsApi.deleteAiModel(deleting));
        }}
      />
    </section>
  );
}

function TierRow({ tier, models, onSaved }: { tier: AiModelSettings["tiers"][number]; models: string[]; onSaved: (s: AiModelSettings) => void }) {
  const [model, setModel] = useState(tier.model ?? "");
  const [backup, setBackup] = useState(tier.backup ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = model !== (tier.model ?? "") || backup !== (tier.backup ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await settingsApi.saveAiTier({ tier: tier.tier, model, backup: backup || null }));
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the tier."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 p-4">
      <div>
        <p className="font-medium capitalize text-foreground">{tier.tier}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{TIER_INFO[tier.tier]}</p>
        {!tier.model ? <p className="mt-1 text-xs text-destructive">No model set: tasks in this tier can’t run.</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Model</span>
          <select className={selectClass} value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="" disabled>
              Pick a model
            </option>
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Backup when it’s unavailable (same standing or better)</span>
          <select className={selectClass} value={backup} onChange={(e) => setBackup(e.target.value)}>
            <option value="">None: the next tier up’s model, if there is one</option>
            {models
              .filter((m) => m !== model)
              .map((m) => (
                <option key={m}>{m}</option>
              ))}
          </select>
        </label>
        <Button onClick={() => void save()} disabled={!changed || !model || busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      <p aria-live="polite" className="text-sm text-destructive empty:hidden">
        {error}
      </p>
    </li>
  );
}

const BLANK: AiModel = { name: "", inputUsdPerM: 0, cachedUsdPerM: 0, outputUsdPerM: 0, cacheBreakpoints: true, evalCandidate: false, judgeRank: null };

function ModelDialog({ model, onClose, onSaved }: { model: AiModel | null; onClose: () => void; onSaved: (s: AiModelSettings) => void }) {
  const [m, setM] = useState<AiModel>(model ?? BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof AiModel>(k: K, v: AiModel[K]) => setM((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await settingsApi.saveAiModel({ ...m, name: m.name.trim() }));
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the model."));
    } finally {
      setBusy(false);
    }
  }

  const priceField = (k: "inputUsdPerM" | "cachedUsdPerM" | "outputUsdPerM", label: string) => (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input type="number" inputMode="decimal" min={0} step="any" required value={Number.isFinite(m[k]) ? m[k] : ""} onChange={(e) => set(k, e.target.valueAsNumber)} />
    </label>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{model ? `Edit ${model.name}` : "Add a model"}</DialogTitle>
          <DialogDescription>Prices from OpenAI’s pricing page, in USD per 1M tokens. A new name is checked with OpenAI before it’s saved.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Model id, exactly as OpenAI lists it</span>
            <Input required value={m.name} onChange={(e) => set("name", e.target.value)} disabled={!!model} className="font-mono" autoComplete="off" spellCheck={false} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {priceField("inputUsdPerM", "Input")}
            {priceField("cachedUsdPerM", "Cached input")}
            {priceField("outputUsdPerM", "Output")}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={m.cacheBreakpoints} onChange={(e) => set("cacheBreakpoints", e.target.checked)} />
            <span>
              Cache breakpoints <span className="text-muted-foreground">(OpenAI GPT-5.6 and later: shared prompt starts are billed at the cached price)</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={m.evalCandidate} onChange={(e) => set("evalCandidate", e.target.checked)} />
            <span>
              Compare in tests <span className="text-muted-foreground">(npm run eval -- --models all)</span>
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Test judge</span>
            <select className={selectClass} value={m.judgeRank ?? ""} onChange={(e) => set("judgeRank", e.target.value ? (Number(e.target.value) as 1 | 2) : null)}>
              <option value="">Not a judge</option>
              <option value="1">Judge 1: scores and side by side (stronger than every compared model)</option>
              <option value="2">Judge 2: side by side (another model family)</option>
            </select>
          </label>
          <p aria-live="polite" className="text-sm text-destructive empty:hidden">
            {error}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
