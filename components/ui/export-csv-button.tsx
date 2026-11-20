"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/lib/download";

/** "Export CSV": downloads `url` as `filename`; a refusal shows beside the button. */
export function ExportCsvButton({ url, filename }: { url: string; filename: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setPending(true);
    setError(null);
    try {
      await downloadFile(url, filename);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => void run()}>
        <Download className="size-4" aria-hidden="true" />
        {pending ? "Exporting…" : "Export CSV"}
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
