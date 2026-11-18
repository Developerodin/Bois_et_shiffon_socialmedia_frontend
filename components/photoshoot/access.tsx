import { Camera } from "lucide-react";
import { featureAccess, type Access } from "@/components/shell/feature-access";

/** The photoshoot pages' shared checks (server): see featureAccess. */
export function photoshootAccess(): Promise<Access> {
  return featureAccess({
    feature: "photoshoot",
    path: "/photoshoot",
    icon: Camera,
    noBusiness: "Photoshoots belong to a business. Create or pick one from the sidebar, then its photoshoots show here.",
    noRead: "Your role cannot see this business's photoshoots. Ask a workspace admin for access.",
  });
}
