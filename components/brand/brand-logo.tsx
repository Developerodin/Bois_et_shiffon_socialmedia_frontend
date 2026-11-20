import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Bois & Chiffons wordmark. Two files in public/brand/: black lettering for light surfaces, white lettering for
 * dark ones; globals.css shows the one that matches the theme. `height` in px; the width follows the artwork (1024 × 301).
 */
export function BrandLogo({ height = 28, className, priority }: { height?: number; className?: string; priority?: boolean }) {
  const width = Math.round((height * 1024) / 301);
  return (
    <span className={cn("inline-block", className)} style={{ width, height }}>
      <Image src="/brand/bnc-logo-white.png" alt="Bois & Chiffons" width={width} height={height} priority={priority} className="logo-on-dark" />
      <Image src="/brand/bnc-logo-black.png" alt="Bois & Chiffons" width={width} height={height} priority={priority} className="logo-on-light" />
    </span>
  );
}
