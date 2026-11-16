// Load balancer health check: answers without calling the Server, so a Server outage doesn't take the website's
// instances out too. Left out of the middleware (no session needed).
export function GET() {
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
}
