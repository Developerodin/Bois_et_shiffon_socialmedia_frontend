import type { ReactNode } from "react";
import type { ArticleBlock, ArticleSpan } from "@/shared";

/** An http(s) URL, else null: anything else is shown as text, never as a link. */
export function httpHref(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function Span({ s }: { s: ArticleSpan }) {
  let node: ReactNode = s.text;
  if (s.italic) node = <em>{node}</em>;
  if (s.bold) node = <strong>{node}</strong>;
  const href = httpHref(s.href);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {node}
    </a>
  ) : (
    <>{node}</>
  );
}

const Line = ({ spans }: { spans: ArticleSpan[] }) => (
  <>
    {spans.map((s, i) => (
      <Span key={i} s={s} />
    ))}
  </>
);

/** An article body as React elements: the same allow-list the server renders to HTML for Shopify (server/blog/render.ts). */
export function ArticleBody({ blocks }: { blocks: ArticleBlock[] }) {
  if (!blocks.length) return <p className="text-sm text-muted-foreground">No text yet.</p>;
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        const first = <Line spans={b.lines[0] ?? []} />;
        if (b.type === "h2") return <h2 key={i} className="text-lg font-semibold">{first}</h2>;
        if (b.type === "h3") return <h3 key={i} className="text-base font-semibold">{first}</h3>;
        if (b.type === "p") return <p key={i}>{first}</p>;
        const List = b.type;
        return (
          <List key={i} className={b.type === "ul" ? "list-disc pl-5" : "list-decimal pl-5"}>
            {b.lines.map((l, j) => (
              <li key={j}>
                <Line spans={l} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
