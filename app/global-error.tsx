"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { ErrorScreen } from "@/components/net/error-screen";
import "./globals.css";

/** The root layout itself failed: this replaces the whole document, so it brings its own html and body. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorScreen
          icon={TriangleAlert}
          code="Error"
          title="The app didn’t load."
          description="Something went wrong on our side. Reload the page; if it keeps happening, send us the reference below."
          reference={error.digest}
        >
          {/* A plain button: the app's components may be what failed. */}
          <button type="button" onClick={reset} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Reload
          </button>
        </ErrorScreen>
      </body>
    </html>
  );
}
