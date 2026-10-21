import { BrandMark } from "@/components/shell/brand-mark";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NavLinks } from "@/components/shell/nav-links";

type Props = {
  hasActiveBrand: boolean;
};

export function AppSidebar({ hasActiveBrand }: Props) {
  return (
    <>
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card/60 md:flex"
        aria-label="Main navigation"
      >
        <div className="px-6 pb-6 pt-6">
          <BrandMark />
          <p className="mt-1 pl-[2.375rem] text-xs text-muted-foreground">
            Multi-brand workspace
          </p>
        </div>
        <nav className="flex-1 px-3" aria-label="Primary">
          <NavLinks hasActiveBrand={hasActiveBrand} />
        </nav>
        {!hasActiveBrand ? (
          <p className="m-4 rounded-2xl border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
            Select a brand to unlock brand-scoped areas.
          </p>
        ) : null}
      </aside>
      <MobileNav hasActiveBrand={hasActiveBrand} />
    </>
  );
}
