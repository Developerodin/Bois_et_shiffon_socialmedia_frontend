import type { Shoot, ShootRequest } from "@/shared";
import { request } from "@/components/settings/api";
import { SLOW_MS } from "@/lib/net";

const enc = encodeURIComponent;

export const shootsUrl = (w: string, b: string) => `/api/v1/workspaces/${enc(w)}/brands/${enc(b)}/photoshoots`;
/** Only this read carries each shot's `downloadUrl`; the list and create answers don't. */
export const shootUrl = (w: string, b: string, id: string) => `${shootsUrl(w, b)}/${enc(id)}`;

export const photoshootApi = {
  /** Charges and queues a shoot. The same `requestId` again returns that shoot instead of charging twice (200, not 202). */
  create: (w: string, b: string, r: ShootRequest, requestId: string): Promise<Shoot> =>
    request<{ shoot: Shoot }>(shootsUrl(w, b), { method: "POST", body: JSON.stringify({ ...r, requestId }), timeoutMs: SLOW_MS }).then((d) => d.shoot),
};
