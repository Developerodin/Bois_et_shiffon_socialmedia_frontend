import { api, session } from "@/api/client";
import type { Goal } from "@/ui/onboarding/state";

/** Typed calls the screens use. Shapes mirror apps/web route responses. */

export type Me = { user: { id: string; email: string; name: string | null }; workspaces: { id: string; name: string; role: string }[] };
export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type AgentEvent = { id: string; runId: string; agentKey: string; createdAt: string; level: "INFO" | "SUCCESS" | "WARN" | "ERROR"; message: string; entityType?: string | null };
export type ContextDocs = {
  docs: { kind: string; title: string; latest: { markdown: string; createdAt: string; status: string } | null }[];
  research: { runId: string; status: RunStatus; error?: string | null } | null;
};

const brandBase = (ws: string, brandId: string) => `/workspaces/${encodeURIComponent(ws)}/brands/${encodeURIComponent(brandId)}`;

export const auth = {
  sendCode: (email: string) => api<{ ok: true }>("/mobile/code", { body: { email } }),
  /** phoneTicket links a just-verified mobile number to this email's account (phone sign-up). */
  async verify(email: string, code: string, phoneTicket?: string) {
    const r = await api<{ token: string; user: Me["user"] }>("/mobile/session", { body: { email, code, phoneTicket } });
    await session.save(r.token);
    return r.user;
  },
  sendPhoneCode: (phone: string) => api<{ ok: true }>("/mobile/phone/code", { body: { phone } }),
  /** A known number signs in; a new one returns a ticket and the app asks for an email next. */
  async verifyPhone(phone: string, code: string): Promise<{ phoneTicket: string } | null> {
    const r = await api<{ token: string } | { needsEmail: true; phoneTicket: string }>("/mobile/phone/session", { body: { phone, code } });
    if ("phoneTicket" in r) return { phoneTicket: r.phoneTicket };
    await session.save(r.token);
    return null;
  },
  async google(idToken: string) {
    const r = await api<{ token: string; user: Me["user"] }>("/mobile/google", { body: { idToken } });
    await session.save(r.token);
    return r.user;
  },
};

export const me = () => api<Me>("/me");

/** One screen opened (admin console → Activity). The server files it under the person's workspace. */
export const recordPageView = (path: string) => api<null>("/activity/page-views", { body: { path, platform: "mobile" } });

/** Does this website open? Checked on A06 before a brand is created. */
export const checkSite = (url: string) => api<{ ok: boolean }>("/site-check", { body: { url } });

/** Creates the brand; the server starts Research, SEO and GEO for it. No name with a website: the server reads it from the site. */
export const createBrand = (workspaceId: string, input: { displayName?: string; websiteUrl?: string; goal?: Goal; about?: string; location?: string; placeId?: string; language?: string }) =>
  api<{ brand: { id: string; displayName: string }; researchRunId: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/brands`, { body: input, workspaceId });

export const contextDocs = (ws: string, brandId: string, signal?: AbortSignal) => api<ContextDocs>(`${brandBase(ws, brandId)}/context-docs`, { workspaceId: ws, signal });

export const agentEvents = (ws: string, brandId: string, after: string | null, signal?: AbortSignal) =>
  api<{ events: AgentEvent[] }>(`${brandBase(ws, brandId)}/agent-events?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, { workspaceId: ws, signal });

export type StoredImage = { key: string; url: string };
export type BrandAssetsView = {
  name: string;
  website: string | null;
  /** Null until Research collected them (or the brand has no website). */
  assets: {
    logo: StoredImage | null;
    colors: { hex: string; from: "site" | "logo" | "products" | "you" }[];
    /** Set once a person edited the palette; Research keeps their colours from then on. */
    colorsEditedAt: string | null;
    fonts: string[];
    products: { title: string; kind: string | null; url: string; image: StoredImage | null }[];
  } | null;
  /** Research's short summary (A09); null until written. Tags and sentences are English, the tagline is the site's own. */
  /** `foundWebsite`: a brand made without a website whose own site the online lookup found, for the owner to accept. */
  summary: { tagline: string | null; tags: string[]; audience: string | null; strengths: string | null; foundWebsite: string | null } | null;
  /** The owner's A10 choices; null fields = not chosen yet. */
  preferences: { tones: string[] | null; contentLanguage: "fr" | "en" | null };
};
export type BrandDetailsEdit = { colors?: string[]; tagline?: string; audience?: string; tones?: string[]; contentLanguage?: "fr" | "en" };

/** Logo, colours, fonts and product photos Research read from the website, its summary and the owner's choices. Image URLs last an hour. */
export const brandAssets = (ws: string, brandId: string) => api<BrandAssetsView>(`${brandBase(ws, brandId)}/assets`, { workspaceId: ws });

/** People's edits (palette, tagline, audience, tones, language); returns the same view as stored. */
export const updateBrandDetails = (ws: string, brandId: string, edit: BrandDetailsEdit) =>
  api<BrandAssetsView>(`${brandBase(ws, brandId)}/assets`, { method: "PATCH", body: edit, workspaceId: ws });

/** Renames the brand. */
export const renameBrand = (ws: string, brandId: string, displayName: string) =>
  api<{ ok: true }>(brandBase(ws, brandId), { method: "PATCH", body: { displayName }, workspaceId: ws });

/** Sets the brand's website (A09 "use it?"); Research only reads it when started again. */
export const setBrandWebsite = (ws: string, brandId: string, websiteUrl: string) =>
  api<{ ok: true }>(brandBase(ws, brandId), { method: "PATCH", body: { websiteUrl }, workspaceId: ws });

/** Starts Research again for the brand (a retry, or after its website changed). */
export const startResearch = (ws: string, brandId: string) =>
  api<{ run: { id: string } }>(`${brandBase(ws, brandId)}/agents/research/runs`, { body: {}, workspaceId: ws });

/** Scout's first post ideas for onboarding (A11). `ideas` is how many it found; null run = none started yet. `waiting`: Research is still writing, ask again. */
export type FirstIdeas = { run: { id: string; status: RunStatus; error: string | null; ideas: number } | null; waiting?: boolean };
/** Starts the first ideas run, or returns the brand's existing one (never a second). */
export const startFirstIdeas = (ws: string, brandId: string) => api<FirstIdeas>(`${brandBase(ws, brandId)}/first-ideas`, { method: "POST", body: {}, workspaceId: ws });
export const firstIdeas = (ws: string, brandId: string, signal?: AbortSignal) => api<FirstIdeas>(`${brandBase(ws, brandId)}/first-ideas`, { workspaceId: ws, signal });

/** Instagram (Instagram Login) and Facebook Pages, the two A12 offers. */
export type SocialProvider = "INSTAGRAM" | "META";
/** The consent page to open in the in-app browser; it comes back to espanda://connect with state + code. */
export const startSocialConnect = (ws: string, brandId: string, provider: SocialProvider) =>
  api<{ url: string }>(`${brandBase(ws, brandId)}/connections/start`, { method: "POST", body: { provider, client: "mobile" }, workspaceId: ws });
/** Finishes a connect this person started; returns the connected account names. */
export const completeSocialConnect = (providerSlug: string, state: string, code: string) =>
  api<{ connected: string[] }>(`/integrations/${encodeURIComponent(providerSlug)}/complete`, { method: "POST", body: { state, code } });

/** A business on Google Maps, for the owner to pick theirs (onboarding "Google Maps" source). */
export type PlaceMatch = { id: string; name: string; address: string | null; type: string | null; rating: number | null; ratingCount: number | null };
/** Up to 5 matches for "name + city"; the search runs on our server (Google's key never reaches the app). */
export const searchPlaces = (query: string, language: string) => api<{ places: PlaceMatch[] }>("/places/search", { body: { query, language } });
