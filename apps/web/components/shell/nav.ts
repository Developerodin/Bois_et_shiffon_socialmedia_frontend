import {
  Bot,
  CalendarDays,
  Gauge,
  Library,
  MessageSquare,
  Settings,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  requiresBrand: boolean;
};

/** Single source of truth for primary navigation (sidebar, mobile sheet, header title). */
export const NAV: readonly NavItem[] = [
  { href: "/", label: "Today", icon: Sun, requiresBrand: false },
  { href: "/agents", label: "Agents", icon: Bot, requiresBrand: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, requiresBrand: true },
  { href: "/studio", label: "Studio", icon: Sparkles, requiresBrand: true },
  { href: "/context", label: "Context", icon: Library, requiresBrand: true },
  { href: "/performance", label: "Performance", icon: Gauge, requiresBrand: true },
  { href: "/chat", label: "Chat", icon: MessageSquare, requiresBrand: true },
  { href: "/settings", label: "Settings", icon: Settings, requiresBrand: true },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV.find((item) => isActivePath(pathname, item.href));
}
