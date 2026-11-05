import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api, session } from "@/api/client";
import i18n from "@/i18n";
import { onboarding, type Goal } from "@/ui/onboarding/state";

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
  /** Email-first sign-in: which screen comes next for this email. */
  emailStep: (email: string) => api<{ next: "password" | "code" | "register" }>("/mobile/email-step", { body: { email } }),
  async passwordSignIn(email: string, password: string) {
    const r = await api<{ token: string; user: Me["user"] }>("/mobile/password", { body: { email, password } });
    await session.save(r.token);
    return r.user;
  },
  /** Register with email + password: emails a code; the account is made when verifyRegistration checks it. */
  register: (email: string, password: string) => api<{ ok: true }>("/mobile/register", { body: { email, password } }),
  async verifyRegistration(email: string, code: string, password: string) {
    const r = await api<{ token: string; user: Me["user"] }>("/mobile/register/verify", { body: { email, code, password } });
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
  /** Business address (Google Maps listing or the owner's own words) and type, e.g. "Furniture store"; null when unknown. */
  location: string | null;
  category: string | null;
  /** Null until Research collected them (or the brand has no website). */
  assets: {
    logo: StoredImage | null;
    colors: { hex: string; from: "site" | "logo" | "products" | "you" }[];
    /** Set once a person edited the palette; Research keeps their colours from then on. */
    colorsEditedAt: string | null;
    fonts: string[];
    products: { title: string; kind: string | null; url: string; image: StoredImage | null }[];
  } | null;
  /** Photos the owner added to the library (Business M08), newest first. */
  uploads: { title: string; addedAt: string; image: StoredImage | null }[];
  /** Research's short summary (A09); null until written. Tags and sentences are English, the tagline is the site's own. */
  /** `foundWebsite`: a brand made without a website whose own site the online lookup found, for the owner to accept. */
  summary: { tagline: string | null; tags: string[]; audience: string | null; strengths: string | null; foundWebsite: string | null } | null;
  /** The owner's A10 choices; null fields = not chosen yet. */
  preferences: { tones: string[] | null; contentLanguage: "fr" | "en" | null };
};
export type BrandDetailsEdit = { colors?: string[]; tagline?: string; audience?: string; tones?: string[]; contentLanguage?: "fr" | "en"; removeUpload?: string };

/** Logo, colours, fonts and product photos Research read from the website, its summary and the owner's choices. Image URLs last an hour. */
/** One credit ledger line (apps/web credits route ?history=1); name: the reel a render charge or refund was for. */
export type CreditLine = { id: string; kind: "reel" | "calendar" | "agent" | "audit" | "refund" | "added"; delta: number; at: string; name: string | null };
/** Balance and the last 20 ledger lines (Business M11). */
export const creditHistory = async () => {
  const b = await currentBrand();
  return api<{ credits: number; history: CreditLine[] }>(`/workspaces/${encodeURIComponent(b.workspaceId)}/credits?history=1`, { workspaceId: b.workspaceId });
};
/** The workspace's credit balance (module header). */
export const workspaceCredits = async (signal?: AbortSignal) => {
  const b = await currentBrand();
  return api<{ credits: number }>(`/workspaces/${encodeURIComponent(b.workspaceId)}/credits`, { workspaceId: b.workspaceId, signal });
};

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
export type SocialProvider = "INSTAGRAM" | "META" | "GOOGLE_BUSINESS";
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

// ---- Reels studio (mobile page 02). Shapes mirror apps/web/server/reels/service.ts. ----

/**
 * The business the app works on: the one remembered on this device (set when onboarding finishes or the person
 * switches), else the onboarding one, else the newest. One lookup per app session; signing out forgets it.
 */
type CurrentBrand = { workspaceId: string; brandId: string; name: string };
const BRAND_KEY = "espanda.brand";
const web = Platform.OS === "web";
const brandStore = {
  get: () => (web ? Promise.resolve(globalThis.localStorage?.getItem(BRAND_KEY) ?? null) : SecureStore.getItemAsync(BRAND_KEY)).catch(() => null),
  set: (v: string) => void (web ? Promise.resolve(globalThis.localStorage?.setItem(BRAND_KEY, v)) : SecureStore.setItemAsync(BRAND_KEY, v)).catch(() => {}),
  clear: () => void (web ? Promise.resolve(globalThis.localStorage?.removeItem(BRAND_KEY)) : SecureStore.deleteItemAsync(BRAND_KEY)).catch(() => {}),
};
let current: CurrentBrand | null = null;
let pending: Promise<CurrentBrand> | null = null;

async function lookUpBrand(): Promise<CurrentBrand> {
  const { workspaces } = await me();
  const saved = await brandStore.get().then((raw) => (raw ? (JSON.parse(raw) as { workspaceId: string; brandId: string }) : null), () => null);
  const ws = workspaces.find((w) => w.id === saved?.workspaceId)?.id ?? workspaces.find((w) => w.id === onboarding.workspaceId)?.id ?? workspaces[0]?.id;
  if (!ws) throw new Error("No workspace");
  const { brands } = await api<{ brands: { id: string; displayName: string; createdAt: string }[] }>(`/workspaces/${encodeURIComponent(ws)}/brands`, { workspaceId: ws });
  const newest = [...brands].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const pick = brands.find((b) => b.id === saved?.brandId) ?? brands.find((b) => b.id === onboarding.brandId) ?? newest;
  if (!pick) throw new Error("No business yet");
  return rememberBrand({ workspaceId: ws, brandId: pick.id, name: pick.displayName });
}

/** Screens call this at once; they share one lookup. */
export function currentBrand(): Promise<CurrentBrand> {
  if (current) return Promise.resolve(current);
  pending ??= lookUpBrand().finally(() => void (pending = null));
  return pending;
}
/** The business to use from now on (end of onboarding, business switcher). Without a name, the next lookup loads it. */
export function rememberBrand(b: CurrentBrand): CurrentBrand;
export function rememberBrand(b: Omit<CurrentBrand, "name">): void;
export function rememberBrand(b: Omit<CurrentBrand, "name"> & { name?: string }) {
  current = b.name === undefined ? null : (b as CurrentBrand);
  brandStore.set(JSON.stringify({ workspaceId: b.workspaceId, brandId: b.brandId }));
  return current ?? undefined;
}
export function forgetBrand() {
  current = null;
  brandStore.clear();
}

export type SceneKind = "detail" | "room" | "physics";
/** transition: how the scene hands over to the next, set by the director (apps/web/server/reels/router.ts). */
export type Transition = "cut" | "match" | "dissolve";
export type ReelScene = { photoKey: string; shot: string; direction: string; onScreenText: string; voiceText: string; kind?: SceneKind; model?: string; prompt?: string; standIn?: boolean; transition?: Transition };
export type ReelPlan = { title: string; presenter: "none"; template: string; voice: string; language?: string; scenes: ReelScene[]; caption: string; hashtags: string[] };
export type RenderStep = "VOICE" | "CLIPS" | "JOIN" | "DONE" | "FAILED";
/** Why a render failed, as a kind the app words itself (apps/web/server/reels/render.ts renderFailure). */
export type RenderFailure = { kind: "unavailable" | "slow" | "scene" | "other"; scene?: number; stoppedAt: "VOICE" | "CLIPS" | "JOIN" };
export type ContentStatus = "PLANNED" | "DRAFT_REVIEW" | "AWAITING_APPROVAL" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "REJECTED" | "BLOCKED" | "CANCELLED";
export type ReelSummary = {
  id: string; title: string; status: ContentStatus; version: number; postUrl: string | null; createdAt: string;
  render: { step: RenderStep; attempt: number; failure: RenderFailure | null } | null;
  seconds: number | null; price: number | null; thumbUrl: string | null; videoUrl: string | null;
};
export type ChatTurn = { role: "user" | "assistant"; text: string; at: string };
export type CheckResult = { check: string; status: "pass" | "warn" | "blocker"; note: string };
export type ReelDetail = {
  item: { id: string; title: string; status: ContentStatus; postUrl: string | null; scheduledFor: string | null };
  version: number; plan: ReelPlan | null; price: number | null;
  caption: { caption?: string; hashtags?: string[] } | null; videoUrl: string | null;
  checks: { overall: "PASS" | "WARN" | "BLOCKER"; results: CheckResult[] } | null;
  // softened: joins (scene n → n+1) the seam check turned into a dissolve because the two shots didn't match.
  // credits: what that attempt was charged (refunded if it failed); null when unknown.
  renders: { id: string; versionId: string; attempt: number; step: RenderStep; failure: RenderFailure | null; softened: number[]; videoKey: string | null; credits: number | null; createdAt: string }[];
  chat: ChatTurn[];
  credits: number;
  photoUrls: Record<string, string>;
};
export type PlanResult = { version: number; plan: ReelPlan; price: number; reply?: string };
/** Progress while a plan is written (apps/web/server/reels/service.ts PlanEvent). */
export type PlanStage = "reading" | "writing" | "directing";
export type DraftSoFar = { reply: string; title: string; scenes: { shot: string; voiceText: string }[] };
export type PlanEvent = { type: "stage"; stage: PlanStage } | ({ type: "draft" } & DraftSoFar);
export type Opportunity = { id: string; title: string; summary: string; angle: string; channels: string[]; decision: "RECOMMEND" | "HOLD" | "REJECT"; score: number; timing: string | null };
export type Connection = { id: string; provider: string; displayName: string; status: "ACTIVE" | "ERROR" | "REVOKED" };

/** A reel costs this many credits per second (apps/web CREDIT_COSTS.reelPerSecond), so seconds = price / this. */
export const REEL_CREDITS_PER_SECOND = 2;
export const reelSeconds = (price: number | null | undefined) => (price ? price / REEL_CREDITS_PER_SECOND : 0);

const AI_MS = 120_000;
const reelBase = async () => {
  const b = await currentBrand();
  return { ws: b.workspaceId, base: `${brandBase(b.workspaceId, b.brandId)}` };
};

export const reels = {
  async list(signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<{ reels: ReelSummary[] }>(`${base}/reels`, { workspaceId: ws, signal });
  },
  /** onEvent: the plan's progress as it's written (R04 streams it). The scriptwriter replies in the app's language. */
  async create(input: { opportunityId?: string; prompt?: string }, onEvent?: (e: PlanEvent) => void) {
    const { ws, base } = await reelBase();
    return api<PlanResult & { id: string }>(`${base}/reels`, { body: { ...input, language: i18n.language }, workspaceId: ws, timeoutMs: AI_MS, onLine: onEvent as ((l: unknown) => void) | undefined });
  },
  async get(id: string, signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<ReelDetail>(`${base}/reels/${encodeURIComponent(id)}`, { workspaceId: ws, signal });
  },
  async chat(id: string, version: number, message: string, onEvent?: (e: PlanEvent) => void) {
    const { ws, base } = await reelBase();
    return api<PlanResult>(`${base}/reels/${encodeURIComponent(id)}/plan`, { body: { version, message, language: i18n.language }, workspaceId: ws, timeoutMs: AI_MS, onLine: onEvent as ((l: unknown) => void) | undefined });
  },
  async save(id: string, version: number, plan: ReelPlan) {
    const { ws, base } = await reelBase();
    return api<PlanResult>(`${base}/reels/${encodeURIComponent(id)}`, { method: "PATCH", body: { version, plan }, workspaceId: ws, timeoutMs: AI_MS });
  },
  /** 402 (ApiError.status) = not enough credits: the app opens the plans screen. */
  async render(id: string, version: number) {
    const { ws, base } = await reelBase();
    return api<{ render: { id: string; step: RenderStep; attempt: number } }>(`${base}/reels/${encodeURIComponent(id)}`, { body: { action: "render", version }, workspaceId: ws });
  },
  async download(id: string, version: number) {
    const { ws, base } = await reelBase();
    return api<{ videoUrl: string }>(`${base}/reels/${encodeURIComponent(id)}`, { body: { action: "send", version, how: "download" }, workspaceId: ws });
  },
  async registerLink(id: string, url: string) {
    const { ws, base } = await reelBase();
    return api<{ ok: true }>(`${base}/reels/${encodeURIComponent(id)}`, { body: { action: "register-link", url }, workspaceId: ws });
  },
  /** Caption/hashtags edit on R07: the shared content route (a new version, checks run again). */
  // The edit route rewrites every text field, so the reel's hook and script go along unchanged.
  async editCaption(id: string, version: number, plan: ReelPlan, caption: string, hashtags: string[]) {
    const { ws, base } = await reelBase();
    const body = { caption, hashtags, hook: plan.scenes[0]?.onScreenText ?? "", script: plan.scenes.map((s) => s.voiceText) };
    return api<unknown>(`${base}/content/${encodeURIComponent(id)}`, { body: { action: "edit", version, body }, workspaceId: ws });
  },
  /** Publish now / schedule on a connected Instagram account. Approves first when the version isn't approved yet. */
  publish: (id: string, version: number, connectionId: string, runAt?: Date, approved = false) => publishContent(id, version, { connectionId, runAt, approve: !approved }),
};

/** Shared by reels and posts: approves the version first when asked to (it's waiting for approval), then publishes or schedules it. */
async function publishContent(id: string, version: number, o: { connectionId: string; runAt?: Date; approve: boolean; mediaKeys?: string[]; boardId?: string }) {
  const { ws, base } = await reelBase();
  const path = `${base}/content/${encodeURIComponent(id)}`;
  // noAutoPublish: this call schedules it itself, at the time the person picked (apps/web automations.ts).
  if (o.approve) await api(path, { body: { action: "decide", version, verdict: "APPROVED", noAutoPublish: true }, workspaceId: ws });
  return api<{ attempts?: { id: string; runAt: string; status: string }[] }>(path, {
    body: { action: "publish", version, connectionId: o.connectionId, runAt: o.runAt?.toISOString(), mediaKeys: o.mediaKeys, boardId: o.boardId },
    workspaceId: ws,
  });
}

export async function opportunities(signal?: AbortSignal) {
  const { ws, base } = await reelBase();
  return api<{ opportunities: Opportunity[] }>(`${base}/opportunities`, { workspaceId: ws, signal });
}
/** How many people are in the current business's workspace (Account M12). */
export async function workspaceMemberCount() {
  const b = await currentBrand();
  const r = await api<{ members: unknown[] }>(`/workspaces/${encodeURIComponent(b.workspaceId)}/members`, { workspaceId: b.workspaceId });
  return r.members.length;
}

/** The workspace's plan (null = none) and the plans on offer (apps/web subscriptions.ts). */
export type Subscription = { plan: { id: "starter" | "professional"; credits: number; renewsAt: string } | null; unlimited: boolean; plans: { id: string; credits: number }[] };
export const subscription = async () => {
  const b = await currentBrand();
  const s = await api<Subscription>(`/workspaces/${encodeURIComponent(b.workspaceId)}/subscription`, { workspaceId: b.workspaceId });
  return { ...s, workspaceId: b.workspaceId };
};

/** The business's automations (Business M10); see apps/web server/services/automations.ts. */
export type Automations = { monthlyPlan: boolean; autoPublish: boolean };
export const automations = {
  async get() {
    const { ws, base } = await reelBase();
    return api<Automations>(`${base}/automations`, { workspaceId: ws });
  },
  async set(change: Partial<Automations>) {
    const { ws, base } = await reelBase();
    return api<Automations>(`${base}/automations`, { method: "PATCH", body: change, workspaceId: ws });
  },
};

/** Disconnect a linked account (Business M09): the server forgets its sign-in. */
export async function disconnectAccount(connectionId: string) {
  const { ws, base } = await reelBase();
  return api<unknown>(`${base}/connections/${encodeURIComponent(connectionId)}`, { method: "DELETE", workspaceId: ws });
}
export async function connections() {
  const { ws, base } = await reelBase();
  return api<{ connections: Connection[] }>(`${base}/connections`, { workspaceId: ws });
}
/**
 * R13 / P04 / M08 "Upload": a JPG/PNG up to 4 MB into this brand's media; returns its storage key.
 * `library`: also add it to the brand's photo library (Business M08) under `title`.
 */
export async function uploadPhoto(uri: string, library?: { title: string }, to?: { workspaceId: string; brandId: string }) {
  const { ws, base } = to ? { ws: to.workspaceId, base: brandBase(to.workspaceId, to.brandId) } : await reelBase();
  const form = new FormData();
  // An expo-file-system File (Expo's documented upload with expo/fetch); the server reads the type from its bytes.
  form.append("file", new File(uri) as unknown as Blob);
  if (library) {
    form.append("library", "1");
    form.append("title", library.title);
  }
  return api<{ key: string; previewUrl: string }>(`${base}/media`, { form, workspaceId: ws, timeoutMs: 60_000 });
}

/**
 * Photoshoot tiers and their price for a shoot of four (apps/web server/photoshoot/tiers.ts, which charges; keep in
 * step). Base is preselected.
 */
export const SHOOT_TIERS = [
  { id: "base", credits: 4 },
  { id: "moderate", credits: 6 },
  { id: "higher", credits: 12 },
  { id: "ultra", credits: 24 },
] as const;
export type ShootTier = (typeof SHOOT_TIERS)[number]["id"];
export type ShootRequest =
  | { kind: "product"; tier: ShootTier; sourceKey: string; ratio: "1:1" | "4:5" | "9:16"; scene: "studio" | "interior" | "custom"; brief: string }
  | { kind: "fashion"; tier: ShootTier; sourceKey: string; ratio: "4:5" | "9:16"; model?: "natural" | "editorial" | "casual"; pose: "fullBody" | "threeQuarter" | "closeUp"; background: "studioMinimal" | "urbanStreet" | "naturalInterior" };
/** One photoshoot (apps/web shoot.ts shootView): links are signed for an hour. */
export type Shoot = {
  id: string; kind: "product" | "fashion"; tier: ShootTier; status: "RUNNING" | "DONE" | "FAILED"; input: ShootRequest;
  credits: number; failed: boolean; createdAt: string; sourceUrl: string; shots: { key: string; url: string }[];
};
export const photoshoots = {
  async list(signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<{ shoots: Shoot[] }>(`${base}/photoshoots`, { workspaceId: ws, signal });
  },
  async get(id: string, signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<{ shoot: Shoot }>(`${base}/photoshoots/${encodeURIComponent(id)}`, { workspaceId: ws, signal });
  },
  async create(request: ShootRequest) {
    const { ws, base } = await reelBase();
    return api<{ shoot: Shoot }>(`${base}/photoshoots`, { method: "POST", body: request, workspaceId: ws });
  },
};

/** A post's text (apps/web ContentVersion.body); photoKeys are the brand photos it shows, the first is the cover. */
export type PostBody = { hook: string; caption: string; hashtags: string[]; slides: string[]; script: string[]; pinTitle: string; altText: string; photoKeys?: string[] };
export type PostChannel = "INSTAGRAM_POST" | "INSTAGRAM_CAROUSEL" | "INSTAGRAM_REEL" | "FACEBOOK_POST" | "PINTEREST_PIN" | "THREADS_POST";
export type PostStatus = "PLANNED" | "BRIEF_READY" | "DRAFT_REVIEW" | "AWAITING_APPROVAL" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "REVIEWED" | "REJECTED" | "BLOCKED";
/** One calendar item (GET …/content): the latest draft, its check and the approver's last word on it. */
export type PostItem = {
  id: string; title: string; channel: PostChannel; status: PostStatus; scheduledFor: string | null; studio: boolean; pillar: string | null;
  brief: { goal?: string; products?: string[]; cta?: string } | null;
  publishIssue: "FAILED" | "CHECK" | null; publishError: string | null;
  latest: {
    version: number; body: PostBody; createdAt: string; byPerson: boolean; photoUrls: string[];
    check: { overall: "PASS" | "WARN" | "BLOCKER"; results: CheckResult[] } | null;
    review: { verdict: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; note: string | null } | null;
  } | null;
};

export const posts = {
  async list(signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<{ items: PostItem[] }>(`${base}/content`, { workspaceId: ws, signal });
  },
  /** P09 "Generate calendar": the Planner (5 credits; 402 = not enough) plans 30 days, then the writer and the check draft them. */
  async generate() {
    const { ws, base } = await reelBase();
    return api<{ run: { id: string; status: string } }>(`${base}/agents/planner/runs`, { body: { input: { chain: true } }, workspaceId: ws });
  },
  /** The "Generate calendar" run: SUCCEEDED carries how many posts were planned; FAILED may carry a reason written for the person. */
  async plannerRun(id: string, signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<{ run: { id: string; status: RunStatus; output: { planned?: number; unscheduled?: number } | null; reason: string | null } }>(
      `${base}/agents/planner/runs?id=${encodeURIComponent(id)}`,
      { workspaceId: ws, signal },
    );
  },
  /** P06: a new post from a product photo; the writer drafts it now and the check follows (about a minute). */
  async create(input: { channel: "INSTAGRAM_POST" | "INSTAGRAM_CAROUSEL"; goal: "newArrival" | "productFeature" | "specialOffer"; product: { title: string; photoKey: string }; direction?: string }) {
    const { ws, base } = await reelBase();
    return api<{ id: string }>(`${base}/content`, { body: input, workspaceId: ws });
  },
  /** A new draft version (the server checks it again straight away). */
  async edit(id: string, version: number, body: PostBody) {
    const { ws, base } = await reelBase();
    return api<PostRelease>(`${base}/content/${encodeURIComponent(id)}`, { body: { action: "edit", version, body }, workspaceId: ws });
  },
  /** Schedules the post with its photo on a connected account (approving it first). */
  schedule: (id: string, version: number, o: { connectionId: string; runAt: Date; approve: boolean; photoKeys?: string[]; boardId?: string }) =>
    publishContent(id, version, { ...o, mediaKeys: o.photoKeys?.length ? o.photoKeys : undefined }),
  /** A scheduled post: cancel it. A publish that may or may not have gone out (CHECK): say what the account shows. */
  async settle(id: string, attemptId: string, action: "cancel" | "posted" | "not-posted") {
    const { ws, base } = await reelBase();
    return api<PostRelease>(`${base}/content/${encodeURIComponent(id)}`, { body: { action, attemptId }, workspaceId: ws });
  },
  /** "Fix it" / "Try again": the writer (re)writes a post stuck without a new draft, or the check runs again. */
  async rewrite(id: string, version: number) {
    const { ws, base } = await reelBase();
    return api<PostRelease>(`${base}/content/${encodeURIComponent(id)}`, { body: { action: "rewrite", version }, workspaceId: ws });
  },
  /** "Re-generate": sends the draft back to the writer with what to change; it rewrites it now. */
  async sendBack(id: string, version: number, note: string) {
    const { ws, base } = await reelBase();
    return api<PostRelease>(`${base}/content/${encodeURIComponent(id)}`, { body: { action: "decide", version, verdict: "CHANGES_REQUESTED", note }, workspaceId: ws });
  },
};

/** The person's permissions on the current business (apps/web permissions.catalog.ts keys). */
export async function myPermissions() {
  const b = await currentBrand();
  const r = await api<{ permissions: string[] }>(`/workspaces/${encodeURIComponent(b.workspaceId)}/my-permissions?brandId=${encodeURIComponent(b.brandId)}`, { workspaceId: b.workspaceId });
  return new Set(r.permissions);
}

/** GET …/content/:id (apps/web publishing.ts releaseState): approval and where the post can go. */
export type PostRelease = {
  latestVersion: number | null; approvalValid: boolean;
  requirements: { provider: "INSTAGRAM" | "META" | "PINTEREST" | "THREADS" | null; minImages: number; maxImages: number; needsBoard: boolean };
  accounts: { id: string; displayName: string }[];
  /** Pinterest boards per account; null = couldn't load them. */
  boards: Record<string, { id: string; name: string }[] | null>;
  attempts: { id: string; status: string; account: string; runAt: string; publishedAt: string | null; externalUrl: string | null; error: string | null }[];
};
export async function postRelease(id: string, signal?: AbortSignal) {
  const { ws, base } = await reelBase();
  return api<PostRelease>(`${base}/content/${encodeURIComponent(id)}`, { workspaceId: ws, signal });
}

/** Google Growth (G13/G14) and Reviews: the brand's Business Profile, read live from Google. */
export type GoogleProfile =
  | { connected: false }
  | { connected: true; name: string; address: string | null; website: string | null; hasHours: boolean; reviewUrl: string | null; verified: boolean };
export type GooglePost = { id: string; summary: string; state: string; createdAt: string; photoUrl: string | null };
export type GoogleReview = { id: string; author: string | null; rating: number | null; comment: string; createdAt: string; reply: { comment: string; updatedAt: string } | null };
export const google = {
  async get() {
    const { ws, base } = await reelBase();
    return api<{ profile: GoogleProfile; posts: GooglePost[] }>(`${base}/google`, { workspaceId: ws });
  },
  async reviews() {
    const { ws, base } = await reelBase();
    return api<{ connected: boolean; average?: number | null; total?: number; reviewUrl?: string | null; reviews: GoogleReview[] }>(`${base}/google/reviews`, { workspaceId: ws });
  },
  async reply(reviewId: string, comment: string) {
    const { ws, base } = await reelBase();
    return api<{ reply: NonNullable<GoogleReview["reply"]> }>(`${base}/google/reviews/${encodeURIComponent(reviewId)}/reply`, { method: "PUT", body: { comment }, workspaceId: ws });
  },
  async post(summary: string, photoKey?: string) {
    const { ws, base } = await reelBase();
    return api<null>(`${base}/google/posts`, { method: "POST", body: { summary, photoKey }, workspaceId: ws });
  },
};

/** An AI suggestion the person edits before sending; nothing is sent by this call. */
export type DraftKind = "review" | "message" | "googlePost";
export async function aiDraft(req: { kind: DraftKind; text?: string; rating?: number; author?: string; topic?: string }) {
  const { ws, base } = await reelBase();
  return (await api<{ draft: string }>(`${base}/customers/draft`, { method: "POST", body: req, workspaceId: ws })).draft;
}

/** Customers inbox (M02/M03/M17): Instagram Direct and Messenger, read live from Meta. Sending needs the person's tap. */
export type InboxChannel = "INSTAGRAM" | "META";
export type InboxAccount = { connectionId: string; channel: InboxChannel; name: string; canRead: boolean; error: string | null };
export type Conversation = {
  id: string;
  connectionId: string;
  channel: InboxChannel;
  person: { id: string; name: string | null };
  updatedAt: string;
  last: { text: string; at: string; fromCustomer: boolean } | null;
};
export type Thread = { channel: InboxChannel; account: string; person: Conversation["person"]; messages: { id: string; text: string; at: string; fromCustomer: boolean }[] };
export const inbox = {
  async list() {
    const { ws, base } = await reelBase();
    return api<{ accounts: InboxAccount[]; conversations: Conversation[] }>(`${base}/customers/inbox`, { workspaceId: ws });
  },
  async thread(connectionId: string, conversationId: string) {
    const { ws, base } = await reelBase();
    return api<Thread>(`${base}/customers/inbox/${encodeURIComponent(connectionId)}/${encodeURIComponent(conversationId)}`, { workspaceId: ws });
  },
  async send(connectionId: string, conversationId: string, text: string) {
    const { ws, base } = await reelBase();
    return api<null>(`${base}/customers/inbox/${encodeURIComponent(connectionId)}/${encodeURIComponent(conversationId)}`, { method: "POST", body: { text }, workspaceId: ws });
  },
};
