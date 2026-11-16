import { NO_WORKSPACE } from "@espanda/shared";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import { pillButton as button } from "@/components/admin/ui";

const field = "h-9 max-w-64 rounded-full border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Workspace and person filters in one plain GET form: every view has its own URL, and a new choice starts again at
 * the newest page. The person box matches any part of a name or email.
 */
export function ActivityPickers({ ws, who, options, hidden = {}, person = true, noWorkspace = false }: { ws?: string; who?: string; options: { workspaces: { id: string; name: string }[] }; hidden?: Record<string, string | undefined>; person?: boolean; noWorkspace?: boolean }) {
  return (
    <AutoSubmitForm className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {/* Each label stays with its field when the row wraps on a phone. */}
      <span className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="pick-ws">
          Workspace
        </label>
        <select id="pick-ws" name="ws" defaultValue={ws ?? ""} className={field}>
          <option value="">All workspaces</option>
          {noWorkspace ? <option value={NO_WORKSPACE}>No workspace</option> : null}
          {options.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </span>
      {person ? (
        <span className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="pick-who">
            Person
          </label>
          <input id="pick-who" name="who" type="search" defaultValue={who} placeholder="Name or email" className={`${field} w-56 px-4 placeholder:text-muted-foreground`} />
        </span>
      ) : null}
      <button type="submit" className={button}>
        Show
      </button>
    </AutoSubmitForm>
  );
}
