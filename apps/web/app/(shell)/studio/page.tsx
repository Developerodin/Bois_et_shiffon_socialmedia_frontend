import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      icon={Sparkles}
      title="Where briefs become finished posts."
      description="Briefs, references, variants, drafts, checks, comments and approval, all in one workspace."
    />
  );
}
