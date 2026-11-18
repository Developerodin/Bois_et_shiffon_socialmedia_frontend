"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ShootRequest } from "@/shared";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageSection } from "@/components/ui/page-section";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { useShootPrices } from "@/components/shell/use-plan-credits";
import { navFor } from "@/lib/nav";
import { withPrice } from "@/lib/plan-credits";
import { CurrentShoot } from "./current-shoot";
import { FashionSetup } from "./fashion-setup";
import { PastShoots } from "./past-shoots";
import { pressAndShow, pressErrorText } from "./press";
import { ProductSetup } from "./product-setup";
import { DEFAULT_FASHION, DEFAULT_PRODUCT, generateBlocker, toRequest, type ShootKind } from "./shoot";

const KINDS = [
  { value: "product", label: "Product" },
  { value: "fashion", label: "Fashion" },
] as const;

/**
 * The photoshoot studio: the setup for a product or a fashion shoot, the shoot just started, and past shoots.
 * Ceiling: while a shoot runs the page polls the list (10 s) and that shoot (5 s); fine at today's scale. Upgrade path:
 * drop the list's poll while "This shoot" tracks the only RUNNING shoot.
 */
export function Studio({ workspaceId, brandId, canCreate, canUpload, initialShootId }: {
  workspaceId: string;
  brandId: string;
  canCreate: boolean;
  canUpload: boolean;
  initialShootId: string | null;
}) {
  const router = useRouter();
  // Both setups live side by side: switching kind only changes which one shows, and each keeps its choices.
  const [kind, setKind] = useState<ShootKind>("product");
  const [product, setProduct] = useState(DEFAULT_PRODUCT);
  const [fashion, setFashion] = useState(DEFAULT_FASHION);
  const [currentId, setCurrentId] = useState(initialShootId);
  const [pressing, setPressing] = useState(false);
  const [error, setError] = useState<{ from: "generate" | "retry"; text: string } | null>(null);
  // A second click in the same frame, before `pressing` disables the button.
  const pressingRef = useRef(false);
  // The page remounts the studio on a brand switch, so this also covers "the brand changed".
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const prices = useShootPrices(workspaceId);

  const setup = kind === "product" ? product : fashion;
  // The setup's reason first; then the plan's prices, so the button always says what it spends.
  const blocker = generateBlocker(kind, setup) ?? prices.blocker;

  async function press(r: ShootRequest, from: "generate" | "retry") {
    if (pressingRef.current) return;
    pressingRef.current = true;
    setPressing(true);
    setError(null);
    try {
      const shoot = await pressAndShow(workspaceId, brandId, r);
      if (!alive.current) return;
      setCurrentId(shoot.id);
      // In the URL so a reload still shows it; tied to the brand, which the page checks.
      router.replace(`/photoshoot?${new URLSearchParams({ shoot: shoot.id, b: brandId })}`, { scroll: false });
    } catch (e) {
      const text = pressErrorText(e);
      if (alive.current && text) setError({ from, text });
    } finally {
      pressingRef.current = false;
      if (alive.current) setPressing(false);
    }
  }

  const current = currentId ? (
    <CurrentShoot
      key={currentId}
      workspaceId={workspaceId}
      brandId={brandId}
      shootId={currentId}
      onRetry={canCreate ? (r) => void press(r, "retry") : undefined}
      pressing={pressing}
      retryError={error?.from === "retry" ? error.text : ""}
    />
  ) : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={navFor("/photoshoot").title}>Create product photos and style apparel on models.</PageHeader>

      {canCreate ? (
        <>
          <SegmentedRadios label="Kind of photoshoot" name="shoot-kind" value={kind} onChange={setKind} options={KINDS} />
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <PageSection id="setup" title="Setup">
              <div className="flex flex-col gap-6">
                {kind === "product" ? (
                  <ProductSetup workspaceId={workspaceId} brandId={brandId} canUpload={canUpload} value={product} onChange={setProduct} />
                ) : (
                  <FashionSetup workspaceId={workspaceId} brandId={brandId} canUpload={canUpload} value={fashion} onChange={setFashion} />
                )}
                {/* Not a form: Enter on a card or switch never starts a paid shoot. */}
                <div className="flex flex-col items-start gap-2">
                  <Button
                    type="button"
                    disabled={pressing || blocker !== null}
                    aria-describedby={blocker ? "generate-blocker" : undefined}
                    onClick={() => {
                      if (blocker === null) void press(toRequest(kind, setup), "generate");
                    }}
                  >
                    {pressing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                    {withPrice("Generate photoshoot", prices.priceOf(setup.tier))}
                  </Button>
                  {blocker ? <p id="generate-blocker" className="text-sm text-muted-foreground">{blocker}</p> : null}
                  {blocker !== null && blocker === prices.blocker && prices.failed ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void prices.reload()}>
                      Read prices again
                    </Button>
                  ) : null}
                  <p role="alert" className="text-sm text-destructive empty:hidden">{error?.from === "generate" ? error.text : ""}</p>
                </div>
              </div>
            </PageSection>
            <div className="flex flex-col gap-3">
              <PageSection id="this-shoot" title="This shoot" description={currentId ? undefined : "Your photos appear here after you generate."} />
              {current}
            </div>
          </div>
        </>
      ) : (
        <>
          {current ? (
            <div className="flex flex-col gap-3">
              <PageSection id="this-shoot" title="This shoot" />
              {current}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">Your role can view photoshoots but not start them.</p>
        </>
      )}

      <PastShoots workspaceId={workspaceId} brandId={brandId} />
    </div>
  );
}
