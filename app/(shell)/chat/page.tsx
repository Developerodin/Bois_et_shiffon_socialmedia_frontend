import { MessageSquare } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      icon={MessageSquare}
      title="Talk to your CMO."
      description="Ask about the active brand. It will explain, search and start agents on your behalf."
    />
  );
}
