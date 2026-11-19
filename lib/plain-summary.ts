/** First real sentence of a strategy document: skips headings and source lists, drops "(Sources: …)" and bare URLs. */
export function plainSummary(markdown: string | undefined) {
  if (!markdown) return null;
  const clean = (l: string) =>
    l
      .replace(/^[-*\d.\s]+/, "")
      .replace(/\((?:sources?)\b[^)]*\)/gi, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\*\*|__|`/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return (
    markdown
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .map(clean)
      .find((l) => l.length > 60 && !/^sources?\b/i.test(l)) ?? null
  );
}
