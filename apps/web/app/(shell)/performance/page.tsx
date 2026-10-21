import { Gauge } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      icon={Gauge}
      slice={7}
      title="What worked, and why."
      description="Post results, learning notes, weekly patterns and the business report."
    />
  );
}
