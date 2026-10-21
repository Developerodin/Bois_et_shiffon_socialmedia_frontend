import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      icon={CalendarDays}
      slice={3}
      title="Your next thirty days, at a glance."
      description="A calendar and list of every planned post, with readiness, owner and missing-asset flags. Drag to reschedule."
    />
  );
}
