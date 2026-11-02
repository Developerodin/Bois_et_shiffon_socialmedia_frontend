/**
 * Reads JSON that is still being written (a streamed model answer): closes the open string, arrays and objects and
 * drops a half-written key or value, so what is complete so far can be shown. Null when nothing parses yet.
 * Only for display while streaming: the finished answer is always parsed and checked in full.
 */
export function parsePartialJson(text: string): unknown {
  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  // Where the text can be cut and still close cleanly: after a complete value, before a comma or a dangling key.
  let safe = 0;
  let safeClosers: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") closers.push("}");
    else if (c === "[") closers.push("]");
    else if (c === "}" || c === "]") closers.pop();
    if (c === "," || c === "{" || c === "[") {
      safe = c === "," ? i : i + 1;
      safeClosers = [...closers];
    }
  }
  // Prefer the whole text with its open string closed (a value being written shows as far as it got).
  const attempts = [
    inString ? `${text.replace(/\\(u[0-9a-fA-F]{0,3})?$/, "")}"${[...closers].reverse().join("")}` : `${text}${[...closers].reverse().join("")}`,
    `${text.slice(0, safe)}${[...safeClosers].reverse().join("")}`,
  ];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // a key without its value yet ("title": or "titl"): fall back to the last clean cut
    }
  }
  return null;
}
