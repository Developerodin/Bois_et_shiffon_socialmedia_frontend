"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setActiveContext } from "@/components/context/api";

/** "Open <workspace>" in the welcome header: make that workspace the active one, then go to the app. */
export function OpenWorkspaceButton({ workspaceId, name }: { workspaceId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      className="py-2 hover:text-foreground disabled:opacity-60"
      onClick={async () => {
        setPending(true);
        try {
          await setActiveContext({ workspaceId });
          router.push("/");
        } catch {
          setPending(false);
        }
      }}
    >
      Open {name}
    </button>
  );
}
