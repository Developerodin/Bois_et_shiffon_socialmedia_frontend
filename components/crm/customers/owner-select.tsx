"use client";

import { ownerName, type Owner } from "@/components/crm/customers/people";
import { selectClass } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The Owner field of a customer, a conversation or a deal: nobody, or someone from the business's members list. An
 * owner the list lacks (gone, or the list not loaded yet) still shows as the pick, named as ownerName names them.
 */
export function OwnerSelect({ value, onChange, owners }: { value: string; onChange(id: string): void; owners: readonly Owner[] }) {
  const list = value && !owners.some((o) => o.id === value) ? [...owners, { id: value, name: ownerName(owners, value) ?? "" }] : owners;
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">Owner</span>
      <select className={cn(selectClass, "pointer-coarse:h-11")} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Nobody yet</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
