/**
 * Proves what Instagram / Threads data we can read, using dashboard-generated test tokens
 * (no OAuth flow or https tunnel needed). Prints data shapes and counts, never tokens.
 *   INSTAGRAM_TEST_TOKEN — Instagram use case → API setup with Instagram login → Generate access tokens
 *   THREADS_TEST_TOKEN   — Threads use case → Settings → User Token Generator (public tester account)
 * Run: npm run probe:meta -w web
 */
type Json = Record<string, unknown> & { data?: Json[]; error?: { message?: string; code?: number } };

async function get(url: string, token: string): Promise<{ ok: boolean; body: Json }> {
  const u = new URL(url);
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  return { ok: res.ok, body: (await res.json().catch(() => ({}))) as Json };
}

function report(label: string, r: { ok: boolean; body: Json }, show: (b: Json) => string) {
  console.log(`${r.ok ? "✓" : "✗"} ${label.padEnd(34)} ${r.ok ? show(r.body) : `${r.body.error?.code ?? ""} ${r.body.error?.message ?? "failed"}`.slice(0, 160)}`);
}

async function instagram(token: string) {
  const G = "https://graph.instagram.com/v23.0";
  const me = await get(`${G}/me?fields=user_id,username,account_type,followers_count,media_count`, token);
  report("IG profile", me, (b) => `@${b.username} (${b.account_type}), ${b.followers_count} followers, ${b.media_count} posts`);
  if (!me.ok) return;
  const media = await get(`${G}/me/media?fields=id,media_type,caption,timestamp,like_count,comments_count,permalink&limit=5`, token);
  report("IG recent posts", media, (b) => `${b.data?.length ?? 0} posts, latest likes=${b.data?.[0]?.like_count ?? "-"} comments=${b.data?.[0]?.comments_count ?? "-"}`);
  const first = media.body.data?.[0]?.id as string | undefined;
  if (first) {
    report("IG post insights", await get(`${G}/${first}/insights?metric=reach,views,likes,comments,saved,shares`, token), (b) =>
      (b.data ?? []).map((m) => `${m.name}=${(m.values as { value: number }[] | undefined)?.[0]?.value ?? m.total_value}`).join(" "));
  }
  report("IG account insights (30d reach)", await get(`${G}/${me.body.user_id}/insights?metric=reach&period=day&metric_type=total_value`, token), (b) =>
    JSON.stringify(b.data?.[0]?.total_value ?? b.data?.[0]?.values ?? "").slice(0, 80));
  report("IG follower demographics", await get(`${G}/${me.body.user_id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=country`, token), (b) =>
    `${((b.data?.[0]?.total_value as { breakdowns?: { results?: unknown[] }[] } | undefined)?.breakdowns?.[0]?.results ?? []).length} countries`);
}

async function threads(token: string) {
  const T = "https://graph.threads.net/v1.0";
  const me = await get(`${T}/me?fields=id,username,threads_biography`, token);
  report("Threads profile", me, (b) => `@${b.username}`);
  if (!me.ok) return;
  const posts = await get(`${T}/me/threads?fields=id,text,timestamp,permalink&limit=5`, token);
  report("Threads recent posts", posts, (b) => `${b.data?.length ?? 0} posts`);
  const first = posts.body.data?.[0]?.id as string | undefined;
  if (first) {
    report("Threads post insights", await get(`${T}/${first}/insights?metric=views,likes,replies,reposts,quotes`, token), (b) =>
      (b.data ?? []).map((m) => `${m.name}=${(m.values as { value: number }[] | undefined)?.[0]?.value ?? m.total_value}`).join(" "));
  }
  report("Threads account insights", await get(`${T}/${me.body.id}/threads_insights?metric=views,likes,followers_count`, token), (b) =>
    (b.data ?? []).map((m) => m.name).join(","));
  report("Threads keyword search", await get(`${T}/keyword_search?q=meuble%20bois%20massif&search_type=RECENT`, token), (b) =>
    `${b.data?.length ?? 0} posts (own posts only until threads_keyword_search is approved)`);
}

(async () => {
  const ig = process.env.INSTAGRAM_TEST_TOKEN;
  const th = process.env.THREADS_TEST_TOKEN;
  if (!ig && !th) console.log("Set INSTAGRAM_TEST_TOKEN and/or THREADS_TEST_TOKEN in apps/web/.env first.");
  if (ig) await instagram(ig);
  else console.log("– Instagram skipped (no INSTAGRAM_TEST_TOKEN)");
  if (th) await threads(th);
  else console.log("– Threads skipped (no THREADS_TEST_TOKEN)");
})();
