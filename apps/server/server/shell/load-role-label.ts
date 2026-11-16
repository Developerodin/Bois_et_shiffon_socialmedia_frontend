import { memberRole } from "@/server/auth/permissions";

/** The member's role name for the sidebar's account row: the workspace role's name, else the legacy enum in words. */
export async function loadRoleLabel(workspaceId: string, userId: string): Promise<string | null> {
  const found = await memberRole(workspaceId, userId);
  if (!found) return null;
  if (found.role?.name) return found.role.name;
  const legacy = found.member.role.toLowerCase();
  return legacy.charAt(0).toUpperCase() + legacy.slice(1);
}
