import { AtSign, BriefcaseBusiness, Camera, CircleDashed, Clapperboard, FileText, GalleryHorizontal, Hash, Image as ImageIcon, Pin, Share2, ThumbsUp, type LucideIcon } from "lucide-react";

/**
 * A post's channel and status in words, and each channel's icon. Kept out of content-panels so the task pages and the
 * Social & Content page don't load the Overview's panels.
 */
export const CHANNEL_LABEL: Record<string, string> = {
  INSTAGRAM_POST: "Instagram post",
  INSTAGRAM_CAROUSEL: "Instagram carousel",
  INSTAGRAM_REEL: "Instagram Reel",
  INSTAGRAM_STORY: "Instagram story",
  FACEBOOK_POST: "Facebook",
  PINTEREST_PIN: "Pinterest",
  THREADS_POST: "Threads",
  LINKEDIN_POST: "LinkedIn",
  X_POST: "X",
};
/** The calendar's channel groups (CHANNEL_GROUPS in calendar-filter.ts) in words. */
export const CHANNEL_GROUP_LABEL: Record<string, string> = {
  meta: "Meta: Facebook + Instagram",
  instagram: "Instagram: all formats",
};
/** A channel or a channel group in words; an unknown value as itself. */
export const channelLabel = (v: string): string => CHANNEL_GROUP_LABEL[v] ?? CHANNEL_LABEL[v] ?? v;
export const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  BRIEF_READY: "Brief ready",
  DRAFT_REVIEW: "Draft in review",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  REVIEWED: "Reviewed",
  REJECTED: "Rejected",
  BLOCKED: "Blocked",
};

/**
 * A small glyph per channel (and channel group); the name says the channel in words. Lucide has no brand marks (and the
 * app had no channel icons), so Instagram's formats show their shape and the others a stand-in.
 */
export const CHANNEL_ICON: Record<string, LucideIcon> = {
  INSTAGRAM_POST: ImageIcon,
  INSTAGRAM_CAROUSEL: GalleryHorizontal,
  INSTAGRAM_REEL: Clapperboard,
  INSTAGRAM_STORY: CircleDashed,
  FACEBOOK_POST: ThumbsUp,
  PINTEREST_PIN: Pin,
  THREADS_POST: AtSign,
  LINKEDIN_POST: BriefcaseBusiness,
  X_POST: Hash,
  meta: Share2,
  instagram: Camera,
};
export const channelIcon = (v: string): LucideIcon => CHANNEL_ICON[v] ?? FileText;
