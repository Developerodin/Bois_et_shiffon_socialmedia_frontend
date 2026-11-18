"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ImageIcon } from "lucide-react";
import { SHOOT_TIER_IDS, type ShootTier } from "@/shared";
import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { useShootPrices } from "@/components/shell/use-plan-credits";
import { creditsText } from "@/lib/plan-credits";
import { LABELS } from "./labels";
import type { Source } from "./shoot";

// The picker (and the library hooks behind it) loads the first time it opens, not with the page.
const LibraryPicker = dynamic(() => import("@/components/library/library-picker").then((m) => m.LibraryPicker), { ssr: false });

/** The photo a shoot starts from: thumbnail, title and a button opening the library picker. `note` shows under the row and in the picker. */
export function SourceRow({ workspaceId, brandId, canUpload, label, required = false, buttonLabel, value, onChange, note }: {
  workspaceId: string;
  brandId: string;
  canUpload: boolean;
  label: string;
  required?: boolean;
  buttonLabel: string;
  value: Source;
  onChange: (s: Source) => void;
  note?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Mounted from the first opening on, so closing returns focus to the button.
  const [opened, setOpened] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        {label}
        {required ? <span className="ml-2 text-xs font-normal text-muted-foreground">Required</span> : null}
      </p>
      <div className="flex items-center gap-3">
        {value.sourceUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed
          <img src={value.sourceUrl} alt="" decoding="async" className="size-16 shrink-0 rounded-xl bg-muted object-cover" />
        ) : (
          <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ImageIcon className="size-5" aria-hidden="true" />
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-sm">{value.sourceTitle ?? "No photo selected"}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setOpened(true);
            setOpen(true);
          }}
        >
          {buttonLabel}
        </Button>
      </div>
      {note}
      {opened ? (
        <LibraryPicker
          workspaceId={workspaceId}
          brandId={brandId}
          open={open}
          onOpenChange={setOpen}
          selectedKey={value.sourceKey}
          canUpload={canUpload}
          title="Choose source asset"
          onUse={(p) => onChange({ sourceKey: p.key, sourceTitle: p.title, sourceUrl: p.url })}
        >
          {note}
        </LibraryPicker>
      ) : null}
    </div>
  );
}

/** Quality: the four tiers with what each costs here (no price on an unlimited workspace). */
export function TierChoice({ workspaceId, name, value, onChange }: { workspaceId: string; name: string; value: ShootTier; onChange: (t: ShootTier) => void }) {
  const priceOf = useShootPrices(workspaceId);
  const options = SHOOT_TIER_IDS.map((t) => {
    const price = priceOf(t);
    return { value: t, title: LABELS.tiers[t].name, description: LABELS.tiers[t].desc, meta: price ? creditsText(price) : undefined };
  });
  return <ChoiceCards legend="Quality" name={name} value={value} onChange={onChange} columns={4} options={options} />;
}
