import { ArrowUpRight } from "lucide-react";
import { dayLabel } from "@/components/data/day-bars";
import { fmt, topPosts, type PostSpec } from "@/lib/analytics-channels";
import { cn } from "@/lib/utils";
import type { ChannelPostDto } from "@/shared";

const TYPE: Record<string, string> = { REELS: "Reel", STORY: "Story", CAROUSEL_ALBUM: "Carousel", VIDEO: "Video", IMAGE: "Photo" };
/** A post's format in words: Reel and Story by where it ran, else by its media; `noun` when the platform says neither. */
export const postType = (p: ChannelPostDto, noun = "Post") => (p.productType === "REELS" || p.productType === "STORY" ? TYPE[p.productType] : TYPE[p.mediaType ?? ""] ?? noun);

/**
 * The best posts of the read, five of them: a table once the card has room (rank, the post, a column per number),
 * the post over its numbers when narrow. Numbers the platform didn't give show "—".
 */
export function TopPerformingPosts({ posts, spec }: { posts: ChannelPostDto[]; spec: PostSpec }) {
  const cols = spec.cols;
  const top = topPosts(posts, cols[0].key);
  // One template for the head and every row: rank, the post, then a column per number once there's room.
  const wide = { gridTemplateColumns: `1.25rem minmax(0,1fr) repeat(${cols.length}, 4.75rem)` };
  return (
    <section aria-labelledby="top-posts-title" className="@container/posts min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h3 id="top-posts-title" className="text-base font-semibold leading-tight">
        Top {spec.plural}
      </h3>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
        {spec.window}, by {cols[0].label.toLowerCase()}
      </p>
      <div aria-hidden className="hidden gap-x-3 border-b border-border pb-2 text-xs text-muted-foreground @min-[30rem]/posts:grid" style={wide}>
        <span />
        <span>{spec.noun}</span>
        {cols.map((c) => (
          <span key={c.key} className="text-right">
            {c.label}
          </span>
        ))}
      </div>
      <ol className="divide-y divide-border">
        {top.map((p, i) => (
          <li key={p.id} className="py-2.5">
            {/* Narrow: the post over its numbers. Wide: one row on the table's template. */}
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-3 @min-[30rem]/posts:hidden">
              <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
              <PostCell p={p} spec={spec} />
              <span />
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">{cols.map((c) => `${fmt(p.metrics?.[c.key])} ${c.label.toLowerCase()}`).join(" · ")}</p>
            </div>
            <div className="hidden items-center gap-x-3 @min-[30rem]/posts:grid" style={wide}>
              <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
              <PostCell p={p} spec={spec} />
              {cols.map((c, j) => (
                <span key={c.key} className={cn("text-right text-sm tabular-nums", j === 0 && "font-medium")}>
                  {fmt(p.metrics?.[c.key])}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PostCell({ p, spec }: { p: ChannelPostDto; spec: PostSpec }) {
  return (
    <div className="min-w-0">
      <p className="line-clamp-2 text-sm">{p.caption ?? (spec.noun === "Pin" ? "Pin" : "No caption")}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>{postType(p, spec.noun)}</span>
        {p.postedAt && <span>&middot; {dayLabel(p.postedAt.slice(0, 10))}</span>}
        {p.permalink && (
          <a href={p.permalink} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            &middot; Open <ArrowUpRight aria-hidden className="size-3" />
          </a>
        )}
      </p>
    </div>
  );
}
