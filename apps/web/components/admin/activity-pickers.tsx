import type { PickerOptions } from "@/server/services/platform-admin";

const field = "h-9 max-w-64 rounded-full border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const button = "rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Workspace and person filters as plain GET forms: no JavaScript, and every view has its own URL. Two forms, so picking
 * another workspace clears the person (who may not be in it). The person picker shows once a workspace is chosen.
 */
export function ActivityPickers({ ws, user, options, hidden = {}, person = true }: { ws?: string; user?: string; options: PickerOptions; hidden?: Record<string, string | undefined>; person?: boolean }) {
  const keep = (extra: Record<string, string | undefined>) =>
    Object.entries({ ...hidden, ...extra }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <form className="flex items-center gap-2">
        {keep({})}
        <label className="text-xs text-muted-foreground" htmlFor="pick-ws">
          Workspace
        </label>
        <select id="pick-ws" name="ws" defaultValue={ws ?? ""} className={field}>
          <option value="">All workspaces</option>
          {options.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button type="submit" className={button}>
          Show
        </button>
      </form>
      {person && ws ? (
        <form className="flex items-center gap-2">
          {keep({ ws })}
          <label className="text-xs text-muted-foreground" htmlFor="pick-user">
            Person
          </label>
          <select id="pick-user" name="user" defaultValue={user ?? ""} className={field}>
            <option value="">Everyone</option>
            {options.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="submit" className={button}>
            Show
          </button>
        </form>
      ) : null}
    </div>
  );
}
