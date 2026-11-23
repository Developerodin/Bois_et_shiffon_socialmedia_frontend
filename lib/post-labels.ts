/** A post's channel and status in words. Kept out of content-panels so the task pages don't load the Overview's panels. */
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
