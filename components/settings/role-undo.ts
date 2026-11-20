/**
 * The change that puts a member back after a role change: the member as it now is (new role) and the old role id to
 * send. Last write wins: if someone else changed the role meanwhile, Undo overwrites that too.
 */
export function undoRoleChange<M extends { role: { id: string } }>(member: M, newRoleId: string): { member: M; roleId: string } {
  return { member: { ...member, role: { ...member.role, id: newRoleId } }, roleId: member.role.id };
}
