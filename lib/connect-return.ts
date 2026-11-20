/** sessionStorage key holding the page a Connect started from, so the provider's redirect can send you back there. */
export const CONNECT_RETURN_KEY = "connect-return";

/**
 * The OAuth callback always lands on Settings. If Connect was pressed on the Connections page, go back to it.
 * Only that one exact path is honoured (never an arbitrary stored value), and an empty value (another tab, private
 * mode, storage blocked) means stay where the callback landed.
 * Ceiling: a per-tab sessionStorage hint; a server-side return URL on the OAuth state would survive a new tab.
 */
export function connectReturnPath(stored: string | null): "/connections" | null {
  return stored === "/connections" ? "/connections" : null;
}
