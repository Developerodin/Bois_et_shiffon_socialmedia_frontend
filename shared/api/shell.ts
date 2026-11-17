/** What the app shell and its pages read about the signed-in person: GET /api/v1/me/shell. */
export type ShellResponse = {
  user: { name: string | null; email: string; image: string | null };
  workspaces: { id: string; name: string; slug: string }[];
  brands: {
    id: string;
    slug: string;
    displayName: string;
    websiteUrl: string | null;
    status: "ACTIVE" | "ARCHIVED";
  }[];
  activeWorkspaceId: string | null;
  activeBrandId: string | null;
  roleLabel: string | null;
  /** Permission keys in the active workspace; empty when there is none. */
  workspacePermissions: string[];
  /** Permission keys in the active workspace plus the active brand's grant; empty when there is no active brand. */
  brandPermissions: string[];
  isPlatformAdmin: boolean;
};

/** POST /api/v1/me/context: make a workspace (and optionally one of its brands) the active one. */
export type ContextRequest = { workspaceId: string; brandId?: string };
