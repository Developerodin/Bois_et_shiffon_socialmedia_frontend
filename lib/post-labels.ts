import type { ComponentType } from "react";
import { FileText } from "lucide-react";
import { FacebookMark, InstagramMark, LinkedInMark, MetaMark, PinterestMark, ThreadsMark, XMark } from "@/components/icons/brand-marks";

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

/** Any icon a channel list can show: a network's own mark or a Lucide icon. */
export type ChannelIcon = ComponentType<{ className?: string }>;

/**
 * Each channel's (and channel group's) network mark; the name or tooltip says the format in words, so Instagram's
 * formats share its mark.
 */
export const CHANNEL_ICON: Record<string, ChannelIcon> = {
  INSTAGRAM_POST: InstagramMark,
  INSTAGRAM_CAROUSEL: InstagramMark,
  INSTAGRAM_REEL: InstagramMark,
  INSTAGRAM_STORY: InstagramMark,
  FACEBOOK_POST: FacebookMark,
  PINTEREST_PIN: PinterestMark,
  THREADS_POST: ThreadsMark,
  LINKEDIN_POST: LinkedInMark,
  X_POST: XMark,
  meta: MetaMark,
  instagram: InstagramMark,
};
export const channelIcon = (v: string): ChannelIcon => CHANNEL_ICON[v] ?? FileText;
