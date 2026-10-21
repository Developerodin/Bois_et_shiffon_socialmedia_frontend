/**
 * Stage 0 OAuth state / nonce store (DEC-017, AT-006).
 * TODO(Screen 11): Persist OAuthStateTransaction with encryption envelope + brandId.
 */

export type OAuthStateRecord = {
  state: string;
  workspaceId: string;
  brandId: string;
  provider: string;
  nonce: string;
  consumedAt: Date | null;
  expiresAt: Date;
};

export class OAuthStateError extends Error {
  readonly code: "OAUTH_STATE_INVALID" | "OAUTH_STATE_REUSED";

  constructor(
    code: "OAUTH_STATE_INVALID" | "OAUTH_STATE_REUSED",
    message: string,
  ) {
    super(message);
    this.name = "OAuthStateError";
    this.code = code;
  }
}

export async function createOAuthState(
  input: Omit<OAuthStateRecord, "consumedAt" | "expiresAt"> & {
    ttlSeconds?: number;
  },
): Promise<OAuthStateRecord> {
  void input;
  throw new Error("OAuth state persistence not implemented — Screen 11");
}

/**
 * TODO(AT-006): Mark state consumed; reject replay.
 */
export async function consumeOAuthState(state: string): Promise<OAuthStateRecord> {
  void state;
  throw new Error("OAuth state consume not implemented — Screen 11");
}
