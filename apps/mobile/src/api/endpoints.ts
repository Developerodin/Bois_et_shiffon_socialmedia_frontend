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

/** The lookup answered: this person has no business yet (as opposed to the lookup failing). */
export class NoBusiness extends Error {}
/** A business was picked on this phone before (end of onboarding, a switch, an earlier lookup). */
export const hasSavedBrand = () => brandStore.get().then((raw) => !!raw);

async function lookUpBrand(): Promise<CurrentBrand> {
  const { workspaces } = await me();
  const saved = await brandStore.get().then((raw) => (raw ? (JSON.parse(raw) as { workspaceId: string; brandId: string }) : null), () => null);
  const ws = workspaces.find((w) => w.id === saved?.workspaceId)?.id ?? workspaces.find((w) => w.id === onboarding.workspaceId)?.id ?? workspaces[0]?.id;
  if (!ws) throw new NoBusiness("No workspace");
  const { brands } = await api<{ brands: { id: string; displayName: string; createdAt: string }[] }>(`/workspaces/${encodeURIComponent(ws)}/brands`, { workspaceId: ws });
  const newest = [...brands].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const pick = brands.find((b) => b.id === saved?.brandId) ?? brands.find((b) => b.id === onboarding.brandId) ?? newest;
  if (!pick) throw new NoBusiness("No business yet");
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
export type ReelScene = { photoKey: string; shot: string; direction: string; onScreenText: string; voiceText: string; kind?: SceneKind; model?: string; prompt?: string; standIn?: boolean; transition?: Transition; presenter?: boolean; recordingId?: string; recordingSeconds?: number };
export type TemplatePreview = { videoKey: string; videoUrl: string; posterKey: string; posterUrl: string };
export type ReelTemplateOption = { id: string; seconds: number; preview: TemplatePreview | null; own: boolean; making: boolean; failed: boolean };
/** A voice a reel may use: "coral" (OpenAI) or "eleven:<id>" (ElevenLabs); sampleUrl to listen to, when there is one. */
export type ReelVoiceOption = { id: string; name: string; gender: "female" | "male" | "neutral" | "clone"; sampleUrl: string | null; clone: boolean; mine: boolean };
/** A voice from ElevenLabs' public library ("library:<id>"); traits are ElevenLabs' own words (e.g. "middle_aged"). */
export type LibraryVoice = { id: string; name: string; gender: string | null; age: string | null; accent: string | null; language: string | null; useCase: string | null; previewUrl: string | null };
export type LibraryFilters = { language?: string; gender?: string; age?: string; useCase?: string; search?: string; page?: number };
/** What cloning needs: whether this person may (workspace admins), its price, the cap, the reading length, the consent text. */
export type CloningInfo = { allowed: boolean; credits: number; max: number; seconds: { min: number; max: number }; consent: string };
export type Presenter = { id: string; name: string; status: "RUNNING" | "DONE" | "FAILED"; sheet: { key: string; url: string } | null };
/** A trait group (gender, age…) and its options, id → English label (the app shows its own words when it has them). */
export type PresenterTrait = { id: string; options: Record<string, string> };
export type ReelOptions = { templates: ReelTemplateOption[]; previewCredits: number; canPreview: boolean; presenters: Presenter[]; traits: PresenterTrait[]; presenterCredits: number };
/** presenter: "none", or one of the brand's presenter ids. */
export type ReelPlan = { voiceName?: string; title: string; presenter: string; template: string; voice: string; language?: string; scenes: ReelScene[]; caption: string; hashtags: string[] };
export type RenderStep = "VOICE" | "CLIPS" | "JOIN" | "DONE" | "FAILED";
/** Why a render failed, as a kind the app words itself (apps/web/server/reels/render.ts renderFailure). */
export type RenderFailure = { kind: "unavailable" | "slow" | "scene" | "voiceDeleted" | "other"; scene?: number; stoppedAt: "VOICE" | "CLIPS" | "JOIN" };
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
  // The reel's and each scene's length in seconds, as the server prices them.
  seconds: number | null; sceneSeconds: number[];
  // "Made with AI." for a reel with a presenter or a cloned voice: shown under the caption, added when it's posted.
  aiDisclosure: string | null;
  caption: { caption?: string; hashtags?: string[] } | null; videoUrl: string | null;
  // The video's media key: the source a story frame uses for this reel.
  videoKey: string | null;
  checks: { overall: "PASS" | "WARN" | "BLOCKER"; results: CheckResult[] } | null;
  // softened: joins (scene n → n+1) the seam check turned into a dissolve because the two shots didn't match.
  // credits: what that attempt was charged (refunded if it failed); null when unknown.
  renders: { id: string; versionId: string; attempt: number; step: RenderStep; failure: RenderFailure | null; softened: number[]; videoKey: string | null; credits: number | null; createdAt: string }[];
  chat: ChatTurn[];
  credits: number;
  photoUrls: Record<string, string>;
};
/** droppedRecordings: scene numbers whose recording was dropped because their text changed. */
export type PlanResult = { version: number; plan: ReelPlan; price: number; reply?: string; droppedRecordings?: number[] };
/** Progress while a plan is written (apps/web/server/reels/service.ts PlanEvent). */
export type PlanStage = "reading" | "writing" | "directing";
export type DraftSoFar = { reply: string; title: string; scenes: { shot: string; voiceText: string }[] };
export type PlanEvent = { type: "stage"; stage: PlanStage } | ({ type: "draft" } & DraftSoFar);
export type Opportunity = { id: string; title: string; summary: string; angle: string; channels: string[]; decision: "RECOMMEND" | "HOLD" | "REJECT"; score: number; timing: string | null };
export type Connection = { id: string; provider: string; displayName: string; status: "ACTIVE" | "ERROR" | "REVOKED" };

/** The reel's length as the server prices it (ReelDetail.seconds). */
export const reelSeconds = (detail: Pick<ReelDetail, "seconds"> | null | undefined) => detail?.seconds ?? 0;

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
  async create(input: { opportunityId?: string; prompt?: string; templateId?: string }, onEvent?: (e: PlanEvent) => void) {
    const { ws, base } = await reelBase();
    return api<PlanResult & { id: string }>(`${base}/reels`, { body: { ...input, language: i18n.language }, workspaceId: ws, timeoutMs: AI_MS, onLine: onEvent as ((l: unknown) => void) | undefined });
  },
  async get(id: string, signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<ReelDetail>(`${base}/reels/${encodeURIComponent(id)}`, { workspaceId: ws, signal });
  },
  /**
   * pick: a template (R12) or presenter (R10) reshapes the plan; `message` is then its name, shown as the person's turn.
   */
  async chat(id: string, version: number, message: string, onEvent?: (e: PlanEvent) => void, pick?: { templateId?: string; presenterId?: string }) {
    const { ws, base } = await reelBase();
    return api<PlanResult>(`${base}/reels/${encodeURIComponent(id)}/plan`, { body: { version, message, ...pick, language: i18n.language }, workspaceId: ws, timeoutMs: AI_MS, onLine: onEvent as ((l: unknown) => void) | undefined });
  },
  /** R12: the templates with their previews (the brand's own, else the generic one; null = show the cover photo). */
  async options(signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<ReelOptions>(`${base}/reels/options`, { workspaceId: ws, signal });
  },
  /** R11 Record voiceover: one take (M4A) for one scene's text. matches: what was heard is that text. */
  async uploadRecording(id: string, uri: string, text: string, language?: string) {
    const { ws, base } = await reelBase();
    const form = new FormData();
    form.append("file", new File(uri) as unknown as Blob);
    form.append("text", text);
    if (language) form.append("language", language);
    return api<{ id: string; seconds: number; transcript: string; matches: boolean }>(`${base}/reels/${encodeURIComponent(id)}/recordings`, { form, workspaceId: ws, timeoutMs: 60_000 });
  },
  /** R11 Voices. */
  async voices(signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<{ voices: ReelVoiceOption[]; cloning: CloningInfo }>(`${base}/voices`, { workspaceId: ws, signal });
  },
  /** Voices → Library: ElevenLabs' public voices, filtered; usable = reels can speak with them yet (paid plan). */
  async voiceLibrary(filters: LibraryFilters, signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    const q = new URLSearchParams(Object.entries(filters).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]])));
    return api<{ voices: LibraryVoice[]; more: boolean; usable: boolean }>(`${base}/voices/library?${q}`, { workspaceId: ws, signal });
  },
  /** Voices → Clone a voice: the reading (M4A), its name and the consent tick. 402 = credits or plan. */
  async createClone(name: string, uri: string, appVersion?: string) {
    const { ws, base } = await reelBase();
    const form = new FormData();
    form.append("file", new File(uri) as unknown as Blob);
    form.append("name", name);
    form.append("consent", "1");
    if (appVersion) form.append("appVersion", appVersion);
    return api<{ id: string; name: string }>(`${base}/voices/clones`, { form, workspaceId: ws, timeoutMs: 90_000 });
  },
  /** withdraw: the owner withdraws consent (otherwise a plain delete). */
  async deleteClone(id: string, withdraw = false) {
    const { ws, base } = await reelBase();
    return api<unknown>(`${base}/voices/clones/${encodeURIComponent(id)}${withdraw ? "?withdraw=1" : ""}`, { method: "DELETE", workspaceId: ws });
  },
  /** R10 "Create presenter": 402 = not enough credits or no plan. traits: group id → option id. */
  async createPresenter(name: string, traits: Record<string, string>) {
    const { ws, base } = await reelBase();
    return api<{ id: string }>(`${base}/reels/presenters`, { body: { name, traits }, workspaceId: ws });
  },
  async removePresenter(id: string) {
    const { ws, base } = await reelBase();
    return api<unknown>(`${base}/reels/presenters/${encodeURIComponent(id)}`, { method: "DELETE", workspaceId: ws });
  },
  /** R12 "Preview with my photos": 402 = not enough credits or no plan. */
  async preview(templateId: string) {
    const { ws, base } = await reelBase();
    return api<{ id: string }>(`${base}/reels/previews`, { body: { templateId }, workspaceId: ws });
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
export type PostChannel = "INSTAGRAM_POST" | "INSTAGRAM_CAROUSEL" | "INSTAGRAM_REEL" | "INSTAGRAM_STORY" | "FACEBOOK_POST" | "PINTEREST_PIN" | "THREADS_POST";
export type PostStatus = "PLANNED" | "BRIEF_READY" | "DRAFT_REVIEW" | "AWAITING_APPROVAL" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "REVIEWED" | "REJECTED" | "BLOCKED";
/** One calendar item (GET …/content): the latest draft, its check and the approver's last word on it. */
export type PostItem = {
  id: string; title: string; channel: PostChannel; status: PostStatus; scheduledFor: string | null; studio: boolean; pillar: string | null;
  brief: { goal?: string; products?: string[]; cta?: string; requestId?: string } | null;
  publishIssue: "FAILED" | "CHECK" | null; publishError: string | null;
  /** Stories only: the first rendered frame (signed for an hour), their cover. */
  firstFrameUrl?: string | null;
  latest: {
    version: number; body: PostBody; createdAt: string; byPerson: boolean; photoUrls: string[];
    check: { overall: "PASS" | "WARN" | "BLOCKER"; results: CheckResult[] } | null;
    review: { verdict: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; note: string | null } | null;
  } | null;
};

/** A catalogue product (Business → Products). Prices are strings ("665.83"); stock null = unknown. The list leaves `description` out. */
export type Product = {
  id: string; source: "WEBSITE" | "SHOPIFY" | "MANUAL"; sku: string | null; title: string; url: string | null; category: string | null;
  materials: string | null; dimensions: string | null; certifications: string | null;
  price: string | null; compareAtPrice: string | null; currency: string | null; inStock: boolean | null; stockQuantity: number | null;
  stockCheckedAt: string | null; imageUrl: string | null;
};
export type FullProduct = Product & { description: string | null };
export type CatalogSync = { at: string; source: "WEBSITE" | "SHOPIFY" | null; count: number; error: string | null; reason?: "not-a-feed" | "partial" | "failed" | "shopify-refused" | null };
/** `running`: a sync is queued or running for the business. */
export type CatalogStatus = { source: "WEBSITE" | "SHOPIFY" | null; catalogSync: CatalogSync | null; running: boolean };
/** People fill these in on every product; a sync never changes them. */
export type ProductFacts = Pick<Product, "materials" | "dimensions" | "certifications">;

export const catalog = {
  list: (ws: string, brandId: string, signal?: AbortSignal) =>
    api<CatalogStatus & { products: Product[] }>(`${brandBase(ws, brandId)}/products`, { workspaceId: ws, signal }),
  /** The sync status without the products: polled while a sync runs. */
  status: (ws: string, brandId: string) => api<CatalogStatus>(`${brandBase(ws, brandId)}/products?status=1`, { workspaceId: ws }),
  get: (ws: string, brandId: string, id: string, signal?: AbortSignal) =>
    api<{ product: FullProduct }>(`${brandBase(ws, brandId)}/products/${encodeURIComponent(id)}`, { workspaceId: ws, signal }),
  update: (ws: string, brandId: string, id: string, facts: ProductFacts) =>
    api<{ product: FullProduct }>(`${brandBase(ws, brandId)}/products/${encodeURIComponent(id)}`, { method: "PATCH", body: facts, workspaceId: ws }),
  /** Starts a sync in the background (202), or finds the one already queued or running (`queued: false`). */
  sync: (ws: string, brandId: string) => api<{ queued: boolean }>(`${brandBase(ws, brandId)}/products/sync`, { method: "POST", body: {}, workspaceId: ws }),
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
  /** The "Generate calendar" run: SUCCEEDED carries how many posts were planned; FAILED says whether there was nothing to plan. */
  async plannerRun(id: string, signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<{ run: { id: string; status: RunStatus; output: { planned?: number; unscheduled?: number } | null; reason: "nothing-to-do" | null } }>(
      `${base}/agents/planner/runs?id=${encodeURIComponent(id)}`,
      { workspaceId: ws, signal },
    );
  },
  /** The Planner run still going for this business, if any: P09 picks it up again after the screen was left. */
  async runningPlanner(signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    const { agents } = await api<{ agents: { key: string; lastRun: { id: string; status: RunStatus } | null }[] }>(`${base}/agents`, { workspaceId: ws, signal });
    const run = agents.find((a) => a.key === "planner")?.lastRun;
    return run && (run.status === "QUEUED" || run.status === "RUNNING") ? run : null;
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
  /** "Re-generate" / "Ask for changes": sends the draft back to the writer with what to change; it rewrites it now.
   * switchProducts: the writer may link another product instead (a product issue). */
  async sendBack(id: string, version: number, note: string, switchProducts?: boolean) {
    const { ws, base } = await reelBase();
    return api<PostRelease>(`${base}/content/${encodeURIComponent(id)}`, { body: { action: "decide", version, verdict: "CHANGES_REQUESTED", note, switchProducts }, workspaceId: ws });
  },
  /** "Approve anyway": approves past the overridable issues (stock, an ended offer). Needs rules.approve and a note of at most 500 characters. */
  async approveAnyway(id: string, version: number, note: string) {
    const { ws, base } = await reelBase();
    return api<PostRelease>(`${base}/content/${encodeURIComponent(id)}`, { body: { action: "decide", version, verdict: "APPROVED", note, override: true }, workspaceId: ws });
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
  /** What stops (refuses) or warns about this post: a linked product sold out, removed or repriced; its offer ended or changed. */
  productIssues: ProductIssue[];
  /** The campaign the post was planned for; times are brand wall-clock strings ("2026-11-30 20:00"), ends null = ongoing. */
  campaign: PostCampaign | null;
};
/** overridable: an approver with rules.approve may approve past it ("Approve anyway"). state: the offer's (ended / withdrawn / changed / early) or the product's stock. */
export type ProductIssue = { productId?: string; campaignId?: string; name?: string; kind: "availability" | "price" | "offer"; state?: string; message: string; refuses: boolean; overridable: boolean };
export type PostCampaign = { kind: "offer" | "campaign" | "priority"; name: string; offer: string | null; discountPercent: number | null; code: string | null; starts: string; ends: string | null; timeZone: string; withdrawn: boolean };
export async function postRelease(id: string, signal?: AbortSignal) {
  const { ws, base } = await reelBase();
  return api<PostRelease>(`${base}/content/${encodeURIComponent(id)}`, { workspaceId: ws, signal });
}

/**
 * Instagram stories (P07, P08, story detail). Types mirror apps/web server/stories/body.ts; the server strips its own
 * fields (mediaKey, renderedKey, aiMark, rights, file) from anything the app sends. Refusals carry ApiError.code.
 */
export type SourceRef = { kind: "upload" | "library" | "product" | "post" | "photoshoot" | "reel"; id: string };
export type StoryFrameInput = {
  source?: SourceRef; label: string; headline: string; body: string; composition?: string;
  crop?: { x: number; y: number; scale: number }; clip?: { start: number; sound: boolean };
};
export type StoryFrame = StoryFrameInput & { mediaKind?: "photo" | "video"; renderedKey?: string; aiMark?: boolean; rights?: { kind: "owned" } | { kind: "confirmed"; by: string; name: string } };
export type StoryBody = { frames: StoryFrame[]; cta: string; link: string; hook: string; productIds: string[]; brandMark: boolean };
export type StoryInput = { frames: StoryFrameInput[]; cta: string; link: string; brandMark: boolean };
export type StoryGoal = "newArrival" | "productFeature" | "specialOffer";
/** The P07 tab the server puts a story in (any partly posted or unconfirmed attempt counts as posted). */
export type StoryTab = "drafts" | "scheduled" | "posted";
/** A story in the content list (GET …/content): its tab and first rendered frame (signed for an hour). */
export type StoryItem = Omit<PostItem, "latest"> & {
  tab: StoryTab; firstFrameUrl: string | null; byHand: boolean; createdAt: string;
  /** Its frames are being prepared (a first save has no version until that ends). */
  rendering: boolean;
  latest: { version: number; body: StoryBody; createdAt: string; byPerson: boolean; check: NonNullable<PostItem["latest"]>["check"] } | null;
};
/** A story's attempt also says how many frames it has and which are out (0-based `i`). */
export type StoryAttempt = PostRelease["attempts"][number] & { frames?: number; progress?: { i: number; state: "publishing" | "published" | "not-posted" }[]; code?: string | null };
/** GET/POST …/content/:id for a story: the post state plus render progress and the latest frames. */
export type StoryRelease = Omit<PostRelease, "attempts"> & {
  attempts: StoryAttempt[]; byHand: boolean; scheduledFor: string | null;
  rendering: boolean; renderError: string | null; renderErrorCode: string | null; renderErrorData: Record<string, unknown> | null;
  /** `sourceSize`: a clip's upright size as the renderer crops it (null for photos, or when unknown). */
  frames: { n: number; url: string | null; sourceUrl?: string | null; sourceSize?: MediaSize | null; kind: "photo" | "video" | null; headline: string }[];
  /** editStory: saved now, or rendering first. */
  saved?: "saved" | "rendering";
};
export type MediaSize = { width: number; height: number };
/** `width`/`height`: a clip's upright size (photos leave them out: the phone measures the decoded photo). */
export type StorySource = { ref: SourceRef; title: string; kind: "photo" | "video"; previewUrl: string; durationSec?: number; width?: number; height?: number };
export type DueStory = { id: string; title: string; scheduledFor: string; firstFrameUrl: string | null };
export type StoryPackage = { frames: { n: number; url: string; kind: "photo" | "video" }[]; link: string };
export type UploadSlot = { uploadId: string; url: string; headers: Record<string, string> };
export type UploadResult = { status: "VERIFIED"; durationSec?: number; width?: number; height?: number; previewUrl: string } | { status: "REJECTED"; reason: string; code: string };

const storyAct = async <T = StoryRelease>(id: string, body: Record<string, unknown>) => {
  const { ws, base } = await reelBase();
  return api<T>(`${base}/content/${encodeURIComponent(id)}`, { body, workspaceId: ws });
};

export const stories = {
  async list(signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    const r = await api<{ items: (PostItem | StoryItem)[] }>(`${base}/content`, { workspaceId: ws, signal });
    return r.items.filter((i): i is StoryItem => i.channel === "INSTAGRAM_STORY");
  },
  /** P07 New story: 5 credits (402 story.credits), once per requestId (one per sheet open); the agent writes it now. */
  async create(requestId: string, input: { goal: StoryGoal; productId: string; direction?: string }) {
    const { ws, base } = await reelBase();
    return api<{ id: string }>(`${base}/content`, { body: { channel: "INSTAGRAM_STORY", requestId, ...input }, workspaceId: ws });
  },
  async get(id: string, signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return api<StoryRelease>(`${base}/content/${encodeURIComponent(id)}`, { workspaceId: ws, signal });
  },
  editStory: (id: string, version: number, story: StoryInput) => storyAct(id, { action: "editStory", version, story }),
  /** The approver signs off this exact version (stories never auto-publish; the person schedules or posts it by hand). */
  approve: (id: string, version: number) => storyAct(id, { action: "decide", version, verdict: "APPROVED" }),
  duplicate: (id: string) => storyAct<{ id: string }>(id, { action: "duplicate" }),
  /** Drafts only (409 story.notDeletable). */
  remove: (id: string) => storyAct<null>(id, { action: "delete" }),
  async sources(productIds: string[] = [], signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    const q = productIds.length ? `?productIds=${encodeURIComponent(productIds.join(","))}` : "";
    return api<{ tabs: { tab: "products" | "library"; items: StorySource[] }[] }>(`${base}/stories/sources${q}`, { workspaceId: ws, signal });
  },
  /** A single-use place to PUT one photo or clip; the person has confirmed "We own or may use this". */
  async uploadSlot(input: { kind: "photo" | "video"; contentType: string; bytes: number }) {
    const { ws, base } = await reelBase();
    return api<UploadSlot>(`${base}/stories/uploads`, { body: { ...input, rightsConfirmed: true }, workspaceId: ws });
  },
  async uploadDone(uploadId: string) {
    const { ws, base } = await reelBase();
    return api<UploadResult>(`${base}/stories/uploads/${encodeURIComponent(uploadId)}`, { method: "POST", body: {}, workspaceId: ws, timeoutMs: 120_000 });
  },
  /** An approved story's frames (links good for an hour), and link for posting it by hand. */
  async package(id: string) {
    const { ws, base } = await reelBase();
    return api<StoryPackage>(`${base}/stories/${encodeURIComponent(id)}/package`, { workspaceId: ws });
  },
  /** Stories due to be posted by hand (needs publish.execute). */
  async due(signal?: AbortSignal) {
    const { ws, base } = await reelBase();
    return (await api<{ items: DueStory[] }>(`${base}/stories/due`, { workspaceId: ws, signal })).items;
  },
  /** Post by hand at `at` (null: stop posting by hand). */
  byHand: (id: string, at: Date | null) => storyAct(id, { action: "byHand", at: at ? at.toISOString() : null }),
  /** "I posted it", with the story's link when the person pastes one. */
  postedByHand: (id: string, url?: string) => storyAct(id, { action: "postedByHand", ...(url ? { url } : {}) }),
  /** confirm: post the rest although the posted frames expired (after a 409 story.expiredConfirm). */
  postRest: (id: string, attemptId: string, confirm?: boolean) => storyAct(id, { action: "postRest", attemptId, ...(confirm ? { confirm: true } : {}) }),
  markDone: (id: string, attemptId: string) => storyAct(id, { action: "markDone", attemptId }),
  /** frame: 0-based. */
  settleFrame: (id: string, attemptId: string, frame: number, appeared: boolean) => storyAct(id, { action: "settleFrame", attemptId, frame, appeared }),
};

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
