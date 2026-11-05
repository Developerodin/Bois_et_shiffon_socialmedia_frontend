import type { IntegrationProvider } from "@prisma/client";
import { appUrl } from "@/server/auth/tokens";

/**
 * OAuth adapters for the "Connect account" buttons. Each brand connects its own accounts;
 * the platform app keys come from env. Endpoints per provider docs (Graph v23, Threads v1.0).
 */
export type ConnectedAccount = {
  externalAccountId: string;
  displayName: string;
  credentials: { accessToken: string; refreshToken?: string };
  tokenExpiresAt: Date | null;
  scopes: string[];
};

type Adapter = {
  label: string;
  envId: string;
  envSecret: string;
  scopes: string[];
  authorizeUrl: (p: { clientId: string; redirectUri: string; state: string; scope: string }) => string;
  exchange: (p: { code: string; clientId: string; secret: string; redirectUri: string }) => Promise<ConnectedAccount[]>;
  /** Swap a token that is about to expire for a fresh one. Absent = the token doesn't expire (Facebook Pages). */
  refresh?: (p: { credentials: ConnectedAccount["credentials"]; clientId: string; secret: string }) => Promise<Pick<ConnectedAccount, "credentials" | "tokenExpiresAt">>;
};

export class ProviderError extends Error {}

/** Shopify is connected with a pasted Admin API token (server/catalog/shopify.ts), so it has no OAuth adapter. */
export type OAuthProvider = Exclude<IntegrationProvider, "SHOPIFY">;

const GRAPH = "https://graph.facebook.com/v23.0";
const REDDIT_UA = "web:ai-cmo-platform:0.1";
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
const expiry = (seconds?: number) => (seconds ? new Date(Date.now() + seconds * 1000) : null);

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string } | string;
    error_message?: string;
    error_description?: string;
  };
  if (!res.ok) {
    const e = body.error;
    const msg = typeof e === "object" ? e?.message : body.error_description ?? body.error_message ?? e;
    throw new ProviderError(`${res.status} ${msg ?? "provider error"}`.slice(0, 300));
  }
  return body;
}

const form = (o: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: qs(o),
});

/** Google's code → tokens, shared by Analytics (GOOGLE) and Business Profile (GOOGLE_BUSINESS). */
async function googleToken({ code, clientId, secret, redirectUri }: { code: string; clientId: string; secret: string; redirectUri: string }) {
  const tok = await call<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>(
    "https://oauth2.googleapis.com/token",
    form({ client_id: clientId, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
  );
  return { credentials: { accessToken: tok.access_token, refreshToken: tok.refresh_token }, tokenExpiresAt: expiry(tok.expires_in), scopes: tok.scope.split(" ") };
}

async function googleRefresh({ credentials, clientId, secret }: { credentials: ConnectedAccount["credentials"]; clientId: string; secret: string }) {
  if (!credentials.refreshToken) throw new ProviderError("400 No refresh token");
  const t = await call<{ access_token: string; expires_in: number }>(
    "https://oauth2.googleapis.com/token",
    form({ client_id: clientId, client_secret: secret, grant_type: "refresh_token", refresh_token: credentials.refreshToken }),
  );
  return { credentials: { ...credentials, accessToken: t.access_token }, tokenExpiresAt: expiry(t.expires_in) };
}

const PINTEREST_SCOPES = ["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write"];

const pinterest: Adapter = {
  label: "Pinterest",
  envId: "PINTEREST_APP_ID",
  envSecret: "PINTEREST_APP_SECRET",
  scopes: PINTEREST_SCOPES,
  authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
    `https://www.pinterest.com/oauth/?${qs({ client_id: clientId, redirect_uri: redirectUri, state, scope, response_type: "code" })}`,
  async exchange({ code, clientId, secret, redirectUri }) {
    // Pinterest v5: Basic auth with the app id/secret; access ~30 days, refresh token ~1 year.
    const tok = await call<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(
      "https://api.pinterest.com/v5/oauth/token",
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: qs({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      },
    );
    const me = await call<{ id?: string; username: string }>("https://api.pinterest.com/v5/user_account", {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    return [{
      externalAccountId: me.id ?? me.username,
      displayName: `@${me.username}`,
      credentials: { accessToken: tok.access_token, refreshToken: tok.refresh_token },
      tokenExpiresAt: expiry(tok.expires_in),
      scopes: tok.scope ? tok.scope.split(/[ ,]+/) : PINTEREST_SCOPES,
    }];
  },
  async refresh({ credentials, clientId, secret }) {
    if (!credentials.refreshToken) throw new ProviderError("400 No refresh token stored; reconnect the account");
    const tok = await call<{ access_token: string; refresh_token?: string; expires_in: number }>("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: qs({ grant_type: "refresh_token", refresh_token: credentials.refreshToken }),
    });
    return { credentials: { accessToken: tok.access_token, refreshToken: tok.refresh_token ?? credentials.refreshToken }, tokenExpiresAt: expiry(tok.expires_in) };
  },
};

export const PROVIDERS: Record<OAuthProvider, Adapter> = {
  PINTEREST: pinterest,
  META: {
    label: "Facebook Pages",
    envId: "META_APP_ID",
    envSecret: "META_APP_SECRET",
    scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "read_insights", "business_management", "pages_messaging"],
    authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
      `https://www.facebook.com/v23.0/dialog/oauth?${qs({ client_id: clientId, redirect_uri: redirectUri, state, scope, response_type: "code" })}`,
    async exchange({ code, clientId, secret, redirectUri }) {
      const short = await call<{ access_token: string }>(
        `${GRAPH}/oauth/access_token?${qs({ client_id: clientId, client_secret: secret, redirect_uri: redirectUri, code })}`,
      );
      const long = await call<{ access_token: string }>(
        `${GRAPH}/oauth/access_token?${qs({ grant_type: "fb_exchange_token", client_id: clientId, client_secret: secret, fb_exchange_token: short.access_token })}`,
      );
      // Page tokens derived from a long-lived user token don't expire. The consent dialog lets
      // the user pick which Pages to grant, so every returned Page is one they chose.
      const pages = await call<{ data: { id: string; name: string; access_token: string }[] }>(
        `${GRAPH}/me/accounts?${qs({ fields: "id,name,access_token", access_token: long.access_token })}`,
      );
      if (!pages.data.length) throw new ProviderError("No Facebook Pages were granted");
      return pages.data.map((p) => ({
        externalAccountId: p.id,
        displayName: p.name,
        credentials: { accessToken: p.access_token },
        tokenExpiresAt: null,
        scopes: PROVIDERS.META.scopes,
      }));
    },
  },
  INSTAGRAM: {
    label: "Instagram",
    envId: "INSTAGRAM_APP_ID",
    envSecret: "INSTAGRAM_APP_SECRET",
    scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights", "instagram_business_manage_messages"],
    authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
      `https://www.instagram.com/oauth/authorize?${qs({ client_id: clientId, redirect_uri: redirectUri, state, scope, response_type: "code" })}`,
    async exchange({ code, clientId, secret, redirectUri }) {
      const short = await call<{ access_token: string }>(
        "https://api.instagram.com/oauth/access_token",
        form({ client_id: clientId, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
      );
      const long = await call<{ access_token: string; expires_in: number }>(
        `https://graph.instagram.com/access_token?${qs({ grant_type: "ig_exchange_token", client_secret: secret, access_token: short.access_token })}`,
      );
      const me = await call<{ user_id: string; username: string }>(
        `https://graph.instagram.com/v23.0/me?${qs({ fields: "user_id,username", access_token: long.access_token })}`,
      );
      return [{
        externalAccountId: me.user_id,
        displayName: `@${me.username}`,
        credentials: { accessToken: long.access_token },
        tokenExpiresAt: expiry(long.expires_in),
        scopes: PROVIDERS.INSTAGRAM.scopes,
      }];
    },
    // Long-lived tokens (60 days) refresh themselves once they're at least a day old.
    async refresh({ credentials }) {
      const t = await call<{ access_token: string; expires_in: number }>(
        `https://graph.instagram.com/refresh_access_token?${qs({ grant_type: "ig_refresh_token", access_token: credentials.accessToken })}`,
      );
      return { credentials: { accessToken: t.access_token }, tokenExpiresAt: expiry(t.expires_in) };
    },
  },
  THREADS: {
    label: "Threads",
    envId: "THREADS_APP_ID",
    envSecret: "THREADS_APP_SECRET",
    scopes: ["threads_basic", "threads_content_publish", "threads_manage_insights"],
    authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
      `https://threads.net/oauth/authorize?${qs({ client_id: clientId, redirect_uri: redirectUri, state, scope, response_type: "code" })}`,
    async exchange({ code, clientId, secret, redirectUri }) {
      const short = await call<{ access_token: string }>(
        "https://graph.threads.net/oauth/access_token",
        form({ client_id: clientId, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
      );
      const long = await call<{ access_token: string; expires_in: number }>(
        `https://graph.threads.net/access_token?${qs({ grant_type: "th_exchange_token", client_secret: secret, access_token: short.access_token })}`,
      );
      const me = await call<{ id: string; username: string }>(
        `https://graph.threads.net/v1.0/me?${qs({ fields: "id,username", access_token: long.access_token })}`,
      );
      return [{
        externalAccountId: me.id,
        displayName: `@${me.username}`,
        credentials: { accessToken: long.access_token },
        tokenExpiresAt: expiry(long.expires_in),
        scopes: PROVIDERS.THREADS.scopes,
      }];
    },
    async refresh({ credentials }) {
      const t = await call<{ access_token: string; expires_in: number }>(
        `https://graph.threads.net/refresh_access_token?${qs({ grant_type: "th_refresh_token", access_token: credentials.accessToken })}`,
      );
      return { credentials: { accessToken: t.access_token }, tokenExpiresAt: expiry(t.expires_in) };
    },
  },
  GOOGLE: {
    label: "Google Analytics & Search Console",
    envId: "GOOGLE_CLIENT_ID",
    envSecret: "GOOGLE_CLIENT_SECRET",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
    authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${qs({
        client_id: clientId, redirect_uri: redirectUri, state, scope: scope.replaceAll(",", " "),
        response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true",
      })}`,
    async exchange(p) {
      const tok = await googleToken(p);
      const me = await call<{ sub: string; email: string }>("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${tok.credentials.accessToken}` },
      });
      return [{ ...tok, externalAccountId: me.sub, displayName: me.email }];
    },
    refresh: googleRefresh,
  },
  GOOGLE_BUSINESS: {
    label: "Google Business Profile",
    envId: "GOOGLE_CLIENT_ID",
    envSecret: "GOOGLE_CLIENT_SECRET",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/business.manage"],
    authorizeUrl: (p) => PROVIDERS.GOOGLE.authorizeUrl(p),
    // One connection per location the Google account manages, like Facebook Pages. They share the account's tokens.
    async exchange(p) {
      const tok = await googleToken(p);
      const auth = { headers: { authorization: `Bearer ${tok.credentials.accessToken}` } };
      const accounts = await call<{ accounts?: { name: string }[] }>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", auth);
      const out: ConnectedAccount[] = [];
      // ponytail: first page of accounts and of each account's locations (100); paginate if someone manages more.
      for (const a of accounts.accounts ?? []) {
        // One account Google refuses (a personal account, a location group, quota) mustn't lose the others.
        const locs = await call<{ locations?: { name: string; title: string }[] }>(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?${qs({ readMask: "name,title", pageSize: "100" })}`,
          auth,
        ).catch((e: unknown) => (console.warn("[integrations] google_business locations", a.name, e), {} as { locations?: undefined }));
        for (const l of locs.locations ?? []) out.push({ ...tok, externalAccountId: `${a.name}/${l.name}`, displayName: l.title }); // accounts/1/locations/2: the v4 path
      }
      // No "400 " prefix: the connect routes show prefix-less provider messages as they are.
      if (!out.length) throw new ProviderError("This Google account doesn't manage a Business Profile. Sign in with the account that does.");
      return out;
    },
    refresh: googleRefresh,
  },
  REDDIT: {
    label: "Reddit",
    envId: "REDDIT_CLIENT_ID",
    envSecret: "REDDIT_CLIENT_SECRET",
    scopes: ["identity", "read", "submit", "history"],
    authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
      `https://www.reddit.com/api/v1/authorize?${qs({
        client_id: clientId, redirect_uri: redirectUri, state, scope: scope.replaceAll(",", " "),
        response_type: "code", duration: "permanent",
      })}`,
    async exchange({ code, clientId, secret, redirectUri }) {
      const tok = await call<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>(
        "https://www.reddit.com/api/v1/access_token",
        {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": REDDIT_UA,
          },
          body: qs({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
        },
      );
      const me = await call<{ id: string; name: string }>("https://oauth.reddit.com/api/v1/me", {
        headers: { authorization: `Bearer ${tok.access_token}`, "user-agent": REDDIT_UA },
      });
      return [{
        externalAccountId: me.id,
        displayName: `u/${me.name}`,
        credentials: { accessToken: tok.access_token, refreshToken: tok.refresh_token },
        tokenExpiresAt: expiry(tok.expires_in),
        scopes: tok.scope.split(" "),
      }];
    },
  },
};

/** URL slug ↔ enum. Callback paths match the *_REDIRECT_URI values in .env. */
export const PROVIDER_SLUGS: Record<string, OAuthProvider> = {
  meta: "META",
  instagram: "INSTAGRAM",
  threads: "THREADS",
  google: "GOOGLE",
  google_business: "GOOGLE_BUSINESS",
  reddit: "REDDIT",
  pinterest: "PINTEREST",
};
export const providerSlug = (p: IntegrationProvider) => p.toLowerCase();

// META_REDIRECT_URI, GOOGLE_BUSINESS_REDIRECT_URI, …: by provider name, since GOOGLE and GOOGLE_BUSINESS share app keys.
const envPrefix = (p: OAuthProvider) => p;

export function providerConfig(p: OAuthProvider) {
  const a = PROVIDERS[p];
  const clientId = process.env[a.envId];
  const secret = process.env[a.envSecret];
  const redirectUri =
    process.env[`${envPrefix(p)}_REDIRECT_URI`] || appUrl(`/api/v1/integrations/${providerSlug(p)}/callback`);
  return clientId && secret ? { clientId, secret, redirectUri } : null;
}
