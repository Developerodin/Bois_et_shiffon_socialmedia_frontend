"use client";

import { memo } from "react";
import Link from "next/link";
import type { Shoot } from "@/shared";
import { StatusBadge } from "@/components/ui/status-badge";
import { dayDate } from "@/lib/time";
import { shootBadge, shootTitle } from "./labels";

/** One past shoot, linking to its page: its first photo (the source photo until it has one), title, date and status. */
export const ShootCard = memo(function ShootCard({ shoot }: { shoot: Shoot }) {
  const image = (shoot.status === "DONE" && shoot.shots[0]?.url) || shoot.sourceUrl;
  return (
    <Link
      href={`/photoshoot/${shoot.id}`}
      className="block rounded-xl ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block aspect-[4/5]">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed */}
        <img src={image} alt="" loading="lazy" decoding="async" className="size-full rounded-xl bg-muted object-cover" />
      </span>
      <span className="flex flex-col items-start gap-1 px-1 pt-2">
        <span className="w-full truncate text-sm font-medium">{shootTitle(shoot.input)}</span>
        <time dateTime={shoot.createdAt} className="text-xs text-muted-foreground">{dayDate(shoot.createdAt)}</time>
        <StatusBadge status={shoot.status}>{shootBadge(shoot)}</StatusBadge>
      </span>
    </Link>
  );
});
