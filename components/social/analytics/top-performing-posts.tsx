"use client";

import { useState } from "react";
import { ArrowUpRight, ImageIcon } from "lucide-react";
import { dayLabel } from "@/components/data/day-bars";
import { FilterSelect } from "@/components/ui/filter-select";
import { fmt, postColumns, postSorts, topPosts, type PostSpec } from "@/lib/analytics-channels";
import { cn } from "@/lib/utils";
import type { ChannelPostDto } from "@/shared";

const TYPE: Record<string, string> = { REELS: "Reel", STORY: "Story", CAROUSEL_ALBUM: "Carousel", VIDEO: "Video", IMAGE: "Photo" };
/** A post's format in words: Reel and Story by where it ran, else by its media; `noun` when the platform says neither. */
export const postType = (p: ChannelPostDto, noun = "Post") => (p.productType === "REELS" || p.productType === "STORY" ? TYPE[p.productType] : TYPE[p.mediaType ?? ""] ?? noun);

/**
 * The best five posts of the read, sortable by any number the platform gave for them (Sort by; the sorted number is
 * always a column): a table once the card has room (rank, the post with its picture, a column per number), the post
 * over its numbers when narrow. Numbers the platform didn't give show "—". Pictures only when some post has one (an
 * older server sends none), and a picture that fails to load (Instagram's links expire) falls back to a plain tile.
 */
export function TopPerformingPosts({ posts, spec }: { posts: ChannelPostDto[]; spec: PostSpec }) {
  const sorts = postSorts(posts, spec);
  const [sortKey, setSortKey] = useState<string>(sorts[0]?.key ?? spec.cols[0].key);
  const sort = sorts.find((c) => c.key === sortKey) ?? sorts[0] ?? spec.cols[0];
  const cols = postColumns(posts, spec, sort);
  const top = topPosts(posts, sort.key);
  const pictures = posts.some((p) => p.thumbnailUrl);
  // One template for the head and every row: rank, the post, then a column per number once there's room.
  const wide = { gridTemplateColumns: `1.25rem minmax(0,1fr) repeat(${cols.length}, 4.25rem)` };
  return (
    <section aria-labelledby="top-posts-title" className="@container/posts min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="top-posts-title" className="text-base font-semibold leading-tight">
            Top {spec.plural}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {spec.window}, by {sort.label.toLowerCase()}
          </p>
        </div>
        {sorts.length > 1 && <FilterSelect label="Sort by" value={sort.key} onChange={setSortKey} options={sorts.map((c) => ({ value: c.key, label: `By ${c.label.toLowerCase()}` }))} />}
      </div>
      <div aria-hidden className="hidden gap-x-3 border-b border-border pb-2 text-xs text-muted-foreground @min-[40rem]/posts:grid" style={wide}>
        <span />
        <span>{spec.noun}</span>
        {cols.map((c) => (
          <span key={c.key} className={cn("text-right", c.key === sort.key && "font-medium text-foreground")}>
            {c.label}
          </span>
        ))}
      </div>
      <ol className="divide-y divide-border">
        {top.map((p, i) => (
          <li key={p.id} className="py-2.5">
            {/* Narrow: the post over its numbers. Wide: one row on the table's template. */}
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-3 @min-[40rem]/posts:hidden">
              <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
              <PostCell p={p} spec={spec} picture={pictures} />
              <span />
              <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">{cols.map((c) => `${fmt(p.metrics?.[c.key])} ${c.label.toLowerCase()}`).join(" · ")}</p>
            </div>
            <div className="hidden items-center gap-x-3 @min-[40rem]/posts:grid" style={wide}>
              <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
              <PostCell p={p} spec={spec} picture={pictures} />
              {cols.map((c) => (
                <span key={c.key} className={cn("text-right text-sm tabular-nums", c.key === sort.key && "font-medium")}>
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

function PostCell({ p, spec, picture }: { p: ChannelPostDto; spec: PostSpec; picture: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {picture && <Thumb src={p.thumbnailUrl ?? null} />}
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm">{p.caption ?? (spec.noun === "Pin" ? "Pin" : "No caption")}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{postType(p, spec.noun)}</span>
          {p.postedAt && <span>&middot; {dayLabel(p.postedAt.slice(0, 10))}</span>}
          {p.permalink && (
            <a href={p.permalink} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              &middot; Open <span className="sr-only">this {spec.noun.toLowerCase()} on the platform</span>
              <ArrowUpRight aria-hidden className="size-3" />
            </a>
          )}
        </p>
      </div>
    </div>
  );
}

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- Instagram's CDN links; next/image needs each host allowed
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}
