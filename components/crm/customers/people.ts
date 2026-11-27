import { useCallback } from "react";
import { settingsApi, type ProjectPeople } from "@/components/settings/api";
import { useLoad } from "@/components/settings/shared";

export type Owner = { id: string; name: string };
const UNNAMED = "Unnamed member";

/**
 * The owner picker's people: everyone on the business (its members list, which brand.read can read), one entry per
 * person, by name. The list doesn't say who holds crm.manage; the server refuses any other owner (400 crm.owner) and
 * the form shows its message.
 */
export function ownerOptions(p: Pick<ProjectPeople, "viaWorkspace" | "people">): Owner[] {
  const byId = new Map<string, string>();
  for (const m of [...p.viaWorkspace, ...p.people]) {
    const name = m.name?.trim() || UNNAMED;
    // The same person on both lists: keep a real name over the fallback.
    if (!byId.has(m.userId) || byId.get(m.userId) === UNNAMED) byId.set(m.userId, name);
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** A person's name for a note or an owner line; someone the list lacks reads as "Another member". */
export const ownerName = (owners: readonly Owner[], id: string | null) => (id ? (owners.find((o) => o.id === id)?.name ?? "Another member") : null);

/** The owner picker's people, read once per mount (empty until loaded, or when the list can't be read). */
export function useOwners(w: string, b: string): Owner[] {
  const fetcher = useCallback(() => settingsApi.projectPeople(w, b).then(ownerOptions), [w, b]);
  const state = useLoad(fetcher).state;
  return state.kind === "ready" ? state.data : [];
}
