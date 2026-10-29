import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { ConnectionBanner } from "@/components/net/connection-banner";
import { THEME_SCRIPT } from "@/components/theme/theme-script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Espanda",
  description: "Your AI marketing team: research, ideas, drafts and checks, approved by you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme script below may add .light / .dark to <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply a saved theme choice before the first paint (no flash of the other theme). Without one, the
            system setting decides (globals.css). components/theme/theme-toggle.tsx writes the choice. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
        <ConnectionBanner />
      </body>
    </html>
  );
}
