import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/studio").title };

export default function Page() {
  return (
    <ComingSoon
      icon={Sparkles}
      backHref="/"
      backLabel="Back to Overview"
      title="Where briefs become finished posts."
      description="Briefs, references, variants, drafts, checks, comments and approval, all in one workspace."
    />
  );
}
