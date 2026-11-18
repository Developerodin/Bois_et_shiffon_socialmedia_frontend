import { Clapperboard } from "lucide-react";
import { featureAccess, type Access } from "@/components/shell/feature-access";

/** The reels pages' shared checks (server): see featureAccess. */
export function reelsAccess(): Promise<Access> {
  return featureAccess({
    feature: "reels",
    path: "/reels",
    icon: Clapperboard,
    noBusiness: "Reels belong to a business. Create or pick one from the sidebar, then its reels show here.",
    noRead: "Your role cannot see this business's reels. Ask a workspace admin for access.",
  });
}
