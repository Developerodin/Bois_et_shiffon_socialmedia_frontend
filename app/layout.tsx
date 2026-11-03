import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { ConnectionBanner } from "@/components/net/connection-banner";
import { NavProgress } from "@/components/nav/nav-progress";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
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
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        {/* Suspense: it reads the URL's query, which would otherwise stop static pages being prerendered. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
        <ConnectionBanner />
      </body>
    </html>
  );
}
