"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TriangleAlert, WifiOff } from "lucide-react";
import { ErrorScreen } from "@/components/net/error-screen";
import { Button } from "@/components/ui/button";
import { isOffline } from "@/lib/net";

/** A page failed to render. Offline gets its own words and retries by itself once the connection is back. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    console.error(error);
    setOffline(isOffline());
    const back = () => reset();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [error, reset]);

  return offline ? (
    <ErrorScreen icon={WifiOff} code="Offline" title="You’re offline." description="This page needs a connection. It loads again by itself as soon as you’re back.">
      <Button onClick={reset}>Try again</Button>
    </ErrorScreen>
  ) : (
    <ErrorScreen
      icon={TriangleAlert}
      code="Error"
      title="This page didn’t load."
      description="Something went wrong on our side. Try again; if it keeps happening, send us the reference below."
      reference={error.digest}
    >
      <Button onClick={reset}>Try again</Button>
      <Button variant="outline" asChild>
        <Link href="/">Go to your workspace</Link>
      </Button>
    </ErrorScreen>
  );
}
