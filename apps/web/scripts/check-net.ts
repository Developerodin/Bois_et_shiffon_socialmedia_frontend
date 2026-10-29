/**
 * lib/net.ts checks: offline, server unreachable and gateway errors, with the browser's online state, its events
 * and fetch faked. Run: npm run check:net -w web
 */
import assert from "node:assert/strict";
import { NetworkError, send } from "@/lib/net";

let online = true;
const win = new EventTarget();
Object.defineProperty(globalThis, "navigator", { value: { get onLine() { return online; } }, configurable: true });
Object.defineProperty(globalThis, "window", { value: win, configurable: true });
const goOnline = () => ((online = true), win.dispatchEvent(new Event("online")));

let calls = 0;
let answer: () => Promise<Response> = async () => Response.json({ ok: true });
globalThis.fetch = (async () => (calls++, answer())) as typeof fetch;
const failure = (p: Promise<unknown>) => p.then(() => "none", (e) => (e instanceof NetworkError ? e.failure : `other: ${e}`));

(async () => {
  // Offline write: fails at once, nothing sent (it might otherwise be sent twice).
  online = false;
  calls = 0;
  assert.equal(await failure(send("/x", { method: "POST" })), "offline");
  assert.equal(calls, 0);

  // Offline read: waits for the connection, then goes through.
  const pending = send("/x");
  setTimeout(goOnline, 20);
  assert.equal((await pending).status, 200);
  assert.equal(calls, 1);

  // Online, but the request dies (fetch's TypeError): the server is unreachable.
  answer = async () => {
    throw new TypeError("Failed to fetch");
  };
  assert.equal(await failure(send("/x")), "unreachable");

  // Connection dropped mid-read: retried once when it's back.
  let first = true;
  answer = async () => {
    if (first) {
      first = false;
      online = false;
      setTimeout(goOnline, 20);
      throw new TypeError("Failed to fetch");
    }
    return Response.json({ ok: true });
  };
  calls = 0;
  assert.equal((await send("/x")).status, 200);
  assert.equal(calls, 2);

  // A gateway's 503 page has no message of its own; our API's 503 problem+json passes through.
  answer = async () => new Response("<html>Bad gateway</html>", { status: 503, headers: { "content-type": "text/html" } });
  assert.equal(await failure(send("/x")), "server-down");
  answer = async () => new Response("", { status: 500 });
  assert.equal(await failure(send("/x")), "server-down");
  answer = async () => Response.json({ detail: "AI isn't set up" }, { status: 503 });
  assert.equal((await send("/x")).status, 503);

  // The caller cancelling isn't a network problem.
  const ctrl = new AbortController();
  answer = async () => {
    ctrl.abort();
    throw new DOMException("aborted", "AbortError");
  };
  assert.match(await failure(send("/x", { signal: ctrl.signal })), /^other: /);

  console.log("✓ offline writes fail at once, offline reads wait and retry, unreachable, gateway errors, cancel");
})();
