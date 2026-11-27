import type { ComponentType, SVGProps } from "react";
import { FacebookMark, InstagramMark, LinkedInMark, PinterestMark, ThreadsMark, XMark } from "@/components/icons/brand-marks";
import type { ChannelId } from "@/lib/analytics-channels";

export type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Each Analytics channel's platform mark (lib/analytics-channels keeps the rest of its description). */
export const CHANNEL_ICON: Record<ChannelId, Icon> = {
  instagram: InstagramMark,
  facebook: FacebookMark,
  pinterest: PinterestMark,
  threads: ThreadsMark,
  linkedin: LinkedInMark,
  x: XMark,
};
