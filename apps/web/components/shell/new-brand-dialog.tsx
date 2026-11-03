"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setActiveBrand } from "@/app/(shell)/actions/shell-context";
import { createBrand, ProblemError } from "@/components/context/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = {
  workspaceId: string;
  /** Element that opens the dialog; defaults to a small "New brand" button. */
  trigger?: ReactNode;
};

type FormError = { field: "name" | "url" | "form"; message: string };

export function NewBrandDialog({ workspaceId, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { brand } = await createBrand(workspaceId, {
        displayName: name.trim(),
        websiteUrl: url.trim(),
      });
      // Brand exists now; if switching fails the user can still pick it from the switcher.
      await setActiveBrand(workspaceId, brand.id);
      setOpen(false);
      setName("");
      setUrl("");
      router.push("/context");
      router.refresh();
    } catch (err) {
      if (err instanceof ProblemError && err.status === 422) {
        // ponytail: the 422 detail has no field path; URL messages mention "url"/"website", the rest are about the name.
        // Upgrade path: return zod issue paths from the brands route.
        setError({
          field: /url|website/i.test(err.message) ? "url" : "name",
          message: err.message || "That website URL is not valid.",
        });
      } else if (err instanceof ProblemError && err.status === 403) {
        setError({
          field: "form",
          message: "Only workspace owners and admins can create brands.",
        });
      } else {
        console.error("[brands] create failed", err);
        setError({
          field: "form",
          message:
            err instanceof ProblemError
              ? err.message
              : "Could not create the brand. Try again.",
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            New brand
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <p className="text-xs font-medium text-primary">
            New brand
          </p>
          <DialogTitle>Add a brand</DialogTitle>
          <DialogDescription>
            Our Research agent will read your site and draft five strategy
            documents for you to confirm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Brand name</span>
            <Input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Outdoors"
              maxLength={80}
              disabled={pending}
              aria-invalid={error?.field === "name" || undefined}
              aria-describedby={
                error?.field === "name" ? "new-brand-name-error" : undefined
              }
            />
            {error?.field === "name" ? (
              <span
                id="new-brand-name-error"
                className="text-xs text-destructive"
              >
                {error.message}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Website URL</span>
            <Input
              required
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={pending}
              aria-invalid={error?.field === "url" || undefined}
              aria-describedby={
                error?.field === "url" ? "new-brand-url-error" : undefined
              }
            />
            {error?.field === "url" ? (
              <span
                id="new-brand-url-error"
                className="text-xs text-destructive"
              >
                {error.message}
              </span>
            ) : null}
          </label>
          {error?.field === "form" ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error.message}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {pending ? "Creating…" : "Create and start research"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
