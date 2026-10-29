import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Espanda logo, the same artwork as the phone app (apps/mobile/assets/figma/espanda-logo.png). Two files: the
 * original for light surfaces, and a copy with light lettering for dark ones (public/brand/); globals.css shows
 * the one that matches the theme. `height` in px; the width follows the artwork (1501 × 438).
 */
export function EspandaLogo({ height = 28, className, priority }: { height?: number; className?: string; priority?: boolean }) {
  const width = Math.round((height * 1501) / 438);
  return (
    <span className={cn("inline-block", className)} style={{ width, height }}>
      <Image src="/brand/espanda-logo-dark.png" alt="Espanda" width={width} height={height} priority={priority} className="logo-on-dark" />
      <Image src="/brand/espanda-logo.png" alt="Espanda" width={width} height={height} priority={priority} className="logo-on-light" />
    </span>
  );
}
