import type { CloningInfo, LibraryFilters, LibraryVoice, PlanResult, ReelPlan, ReelVoiceOption, RenderStep } from "@/shared";
import { request } from "@/components/settings/api";
import { CLIENT_TAG, SLOW_MS } from "@/lib/net";
import { libraryQuery } from "./voices";

const enc = encodeURIComponent;

export const brandUrl = (w: string, b: string) => `/api/v1/workspaces/${enc(w)}/brands/${enc(b)}`;
export const reelsUrl = (w: string, b: string) => `${brandUrl(w, b)}/reels`;
export const reelUrl = (w: string, b: string, id: string) => `${reelsUrl(w, b)}/${enc(id)}`;
export const reelOptionsUrl = (w: string, b: string) => `${reelsUrl(w, b)}/options`;
export const opportunitiesUrl = (w: string, b: string) => `${brandUrl(w, b)}/opportunities`;
export const voicesUrl = (w: string, b: string) => `${brandUrl(w, b)}/voices`;
export const voiceLibraryUrl = (w: string, b: string, q: string) => `${voicesUrl(w, b)}/library${q ? `?${q}` : ""}`;
export const presentersUrl = (w: string, b: string) => `${reelsUrl(w, b)}/presenters`;
export const previewsUrl = (w: string, b: string) => `${reelsUrl(w, b)}/previews`;

/** One take (a recording) of one scene's text; `matches`: what was heard is that text. */
export type Take = { id: string; seconds: number; transcript: string; matches: boolean };

// create and chat stream NDJSON (onLine set): progress lines go to onLine, the last line is the result or the error.
// The same requestId again returns the earlier answer instead of writing a second plan.
export const reelsApi = {
  create: (w: string, b: string, body: { prompt?: string; opportunityId?: string; templateId?: string }, requestId: string, onLine: (l: unknown) => void): Promise<PlanResult & { id: string }> =>
    request<PlanResult & { id: string }>(reelsUrl(w, b), { method: "POST", body: JSON.stringify({ ...body, language: "en", requestId }), timeoutMs: SLOW_MS, onLine }),
  chat: (w: string, b: string, id: string, body: { version: number; message?: string; templateId?: string; presenterId?: string }, requestId: string, onLine: (l: unknown) => void): Promise<PlanResult> =>
    request<PlanResult>(`${reelUrl(w, b, id)}/plan`, { method: "POST", body: JSON.stringify({ ...body, language: "en", requestId }), timeoutMs: SLOW_MS, onLine }),
  /** Saves an edited plan. 409 reel.changed: the plan moved on since `version`. */
  save: (w: string, b: string, id: string, body: { version: number; plan: ReelPlan }): Promise<PlanResult> =>
    request<PlanResult>(reelUrl(w, b, id), { method: "PATCH", body: JSON.stringify(body), timeoutMs: SLOW_MS }),
  recording: (w: string, b: string, id: string, file: Blob, fileName: string, text: string, language?: string): Promise<Take> => {
    const form = new FormData();
    form.append("file", file, fileName);
    form.append("text", text);
    if (language) form.append("language", language);
    return request<Take>(`${reelUrl(w, b, id)}/recordings`, { method: "POST", body: form, timeoutMs: 120_000 });
  },
  makePresenter: (w: string, b: string, body: { name: string; traits: Record<string, string> }) =>
    request<{ id: string }>(presentersUrl(w, b), { method: "POST", body: JSON.stringify(body) }),
  removePresenter: (w: string, b: string, id: string) => request<void>(`${presentersUrl(w, b)}/${enc(id)}`, { method: "DELETE" }),
  preview: (w: string, b: string, templateId: string) => request<{ id: string }>(previewsUrl(w, b), { method: "POST", body: JSON.stringify({ templateId }) }),
  /** Make video / Try again. Never sends `again`: the server answers a running render instead of charging twice, and refuses (409 render.alreadyDone) a version that already has a video. */
  render: (w: string, b: string, id: string, version: number) =>
    request<{ render: { id: string; step: RenderStep; attempt: number } }>(reelUrl(w, b, id), { method: "POST", body: JSON.stringify({ action: "render", version }) }),
  /** Download: the route's `send` action, which approves a version awaiting approval. Named as the phone names it. */
  download: (w: string, b: string, id: string, version: number) =>
    request<{ videoUrl: string; downloadUrl: string }>(reelUrl(w, b, id), { method: "POST", body: JSON.stringify({ action: "send", version, how: "download" }) }),
  /** Starts the checks again when they never landed ("none": nothing to check). */
  recheck: (w: string, b: string, id: string) =>
    request<{ status: "started" | "checking" | "none" }>(reelUrl(w, b, id), { method: "POST", body: JSON.stringify({ action: "recheck" }) }),
  /** "Posted it? Add link": the post's address, for a reel posted by hand. */
  registerLink: (w: string, b: string, id: string, url: string) =>
    request<{ ok: true }>(reelUrl(w, b, id), { method: "POST", body: JSON.stringify({ action: "register-link", url }) }),
  /**
   * Caption and hashtags, through the shared content route (a new version; the checks run again). 409 draft.changed:
   * a newer version was saved since `version`. The route defaults hook and script, and for a reel the server takes them
   * from the plan, so the web sends neither (the phone still sends them, and needs no change).
   */
  editCaption: (w: string, b: string, id: string, version: number, caption: string, hashtags: string[]) =>
    request<unknown>(`${brandUrl(w, b)}/content/${enc(id)}`, { method: "POST", body: JSON.stringify({ action: "edit", version, body: { caption, hashtags } }) }),
};

export const voicesApi = {
  list: (w: string, b: string) => request<{ voices: ReelVoiceOption[]; cloning: CloningInfo }>(voicesUrl(w, b)),
  library: (w: string, b: string, f: LibraryFilters, signal: AbortSignal) =>
    request<{ voices: LibraryVoice[]; more: boolean; usable: boolean }>(voiceLibraryUrl(w, b, libraryQuery(f)), { signal }),
  /** The sentences to read for one clone attempt (single use). */
  challenge: (w: string, b: string, lang: string, signal?: AbortSignal) =>
    request<{ challengeId: string; lang: string; sentences: string[] }>(`${voicesUrl(w, b)}/clones/challenge?lang=${enc(lang)}`, { signal }),
  /** One requestId per take: a retry of the same take returns the first voice instead of a second charge. */
  clone: (w: string, b: string, body: { file: Blob; fileName: string; name: string; challengeId: string; consentVersion: string }, requestId: string) => {
    const form = new FormData();
    form.append("file", body.file, body.fileName);
    form.append("name", body.name);
    form.append("consent", "1");
    form.append("consentVersion", body.consentVersion);
    form.append("challengeId", body.challengeId);
    form.append("requestId", requestId);
    form.append("appVersion", CLIENT_TAG);
    return request<{ id: string; name: string }>(`${voicesUrl(w, b)}/clones`, { method: "POST", body: form, timeoutMs: 120_000 });
  },
  rename: (w: string, b: string, id: string, name: string) =>
    request<void>(`${voicesUrl(w, b)}/clones/${enc(id)}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  /** withdraw: the owner withdraws consent (otherwise a plain delete). */
  remove: (w: string, b: string, id: string, withdraw: boolean) =>
    request<void>(`${voicesUrl(w, b)}/clones/${enc(id)}${withdraw ? "?withdraw=1" : ""}`, { method: "DELETE" }),
};
