import Link from "next/link";
import { Compass } from "lucide-react";
import { ErrorScreen } from "@/components/net/error-screen";
import { Button } from "@/components/ui/button";

/** Any page that doesn't exist, and pages that call notFound() (a brand or document you can't see). */
export default function NotFound() {
  return (
    <ErrorScreen
      icon={Compass}
      code="404"
      title="This page doesn’t exist."
      description="The link may be old, or the page was moved or deleted. If someone sent it to you, it may be in a workspace you haven’t joined."
    >
      <Button asChild>
        <Link href="/">Go to your workspace</Link>
      </Button>
    </ErrorScreen>
  );
}
