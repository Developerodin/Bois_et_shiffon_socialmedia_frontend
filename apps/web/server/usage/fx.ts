/**
 * USD → INR for the spend views (npm run usage, /admin). USD_INR in .env when set, else today's rate from
 * open.er-api.com, kept for 6 hours. Null when neither is available: callers show USD only.
 */
const TTL_MS = 6 * 3_600_000;
let cached: { at: number; value: { rate: number; from: string; asOf?: Date } | null } | null = null;

export async function usdInrRate(): Promise<{ rate: number; from: string; asOf?: Date } | null> {
  if (process.env.USD_INR) return { rate: Number(process.env.USD_INR), from: "USD_INR in .env" };
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value: { rate: number; from: string; asOf?: Date } | null = null;
  try {
    const body = (await (await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) })).json()) as { rates?: { INR?: number }; time_last_update_utc?: string };
    value = body.rates?.INR ? { rate: body.rates.INR, from: `open.er-api.com, ${body.time_last_update_utc}`, asOf: body.time_last_update_utc ? new Date(body.time_last_update_utc) : undefined } : null;
  } catch {
    value = null;
  }
  // A failed lookup is kept for a minute only, so one outage doesn't hide INR for six hours.
  cached = { at: value ? Date.now() : Date.now() - TTL_MS + 60_000, value };
  return value;
}
