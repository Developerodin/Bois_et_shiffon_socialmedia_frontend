"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { ErrorScreen } from "@/components/net/error-screen";
import { buttonVariants } from "@/components/ui/button";
import "./globals.css";

/** The root layout itself failed: this replaces the whole document, so it brings its own html and body. */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset?: () => void }) {
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
          {/* A plain button with the shared classes: the app's components may be what failed, so reload the whole document. */}
          <button type="button" onClick={() => location.reload()} className={buttonVariants()}>
            Reload
          </button>
        </ErrorScreen>
      </body>
    </html>
  );
}
