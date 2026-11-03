import { Fragment, type ReactNode } from "react";

// Tiny, safe markdown subset: #/##/### headings, -/* and 1. lists, **bold**,
// paragraphs. Everything renders as React text nodes (no HTML injection).
// Anything else (tables, links, code) shows as plain text. Upgrade path: a
// sanitising markdown library if docs start relying on richer syntax.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "p"; text: string };

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (!line) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] });
    } else if (bullet || numbered) {
      flush();
      const type = bullet ? "ul" : "ol";
      const text = bullet ? bullet[1] : numbered ? numbered[1] : "";
      const last = blocks[blocks.length - 1];
      if (last && last.type === type) last.items.push(text);
      else blocks.push({ type, items: [text] });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-4 text-[0.95rem] leading-relaxed text-foreground/85">
      {parse(source).map((block, i) => {
        if (block.type === "h") {
          if (block.level <= 1) {
            return (
              <h3
                key={i}
                className="font-display text-2xl font-medium tracking-tight text-foreground"
              >
                {inline(block.text)}
              </h3>
            );
          }
          if (block.level === 2) {
            return (
              <h3
                key={i}
                className="mt-2 font-display text-xl font-medium tracking-tight text-foreground"
              >
                {inline(block.text)}
              </h3>
            );
          }
          return (
            <h4
              key={i}
              className="mt-1 text-xs font-medium text-primary"
            >
              {inline(block.text)}
            </h4>
          );
        }
        if (block.type === "p") {
          return (
            <p key={i} className="text-pretty">
              {inline(block.text)}
            </p>
          );
        }
        const items = block.items.map((item, j) => (
          <li key={j}>{inline(item)}</li>
        ));
        return block.type === "ul" ? (
          <ul
            key={i}
            className="flex list-disc flex-col gap-1.5 pl-5 marker:text-primary"
          >
            {items}
          </ul>
        ) : (
          <ol
            key={i}
            className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-primary"
          >
            {items}
          </ol>
        );
      })}
    </div>
  );
}
