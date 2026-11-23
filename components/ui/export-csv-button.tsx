"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/lib/download";

/** "Export CSV" (or `label`): downloads `url` as `filename`; a refusal shows beside the button. */
export function ExportCsvButton({ url, filename, label = "Export CSV" }: { url: string; filename: string; label?: string }) {
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
        {pending ? "Exporting…" : label}
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
