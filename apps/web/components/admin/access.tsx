import { Check } from "lucide-react";
import { PERMISSIONS, type MemberPermissions } from "@espanda/shared";
import { Empty } from "@/components/admin/ui";

/**
 * What one person can do, as a matrix: every permission down the side, one column per scope (the workspace, then
 * each project), and in each cell a tick with the role that grants it.
 */
export function AccessMatrix({ columns }: { columns: { key: string; label: string; grants: MemberPermissions }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Permission</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {PERMISSIONS.map(([key, , description]) => (
            <tr key={key} className="hover:bg-muted/40">
              <th scope="row" className="px-4 py-2 font-normal">
                <span className="text-sm text-foreground">{description}</span>
                <span className="block font-mono text-muted-foreground">{key}</span>
              </th>
              {columns.map((c) => {
                const via = c.grants.find((g) => g.key === key)?.via;
                return (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2">
                    {via ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <Check className="size-3.5" aria-hidden="true" />
                        <span className="text-muted-foreground">{via}</span>
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
