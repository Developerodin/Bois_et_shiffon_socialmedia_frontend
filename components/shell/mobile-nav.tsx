"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { BrandMark } from "@/components/shell/brand-mark";
import { NavLinks } from "@/components/shell/nav-links";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Props = {
  hasActiveBrand: boolean;
};

export function MobileNav({ hasActiveBrand }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center border-b border-border bg-card px-4 py-3 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-card">
          <SheetHeader>
            <SheetTitle className="text-left">
              <BrandMark />
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-6" aria-label="Primary">
            <NavLinks
              hasActiveBrand={hasActiveBrand}
              onNavigate={() => setOpen(false)}
            />
          </nav>
        </SheetContent>
      </Sheet>
      <div className="ml-3">
        <BrandMark />
      </div>
    </div>
  );
}
