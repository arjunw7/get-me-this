import localFont from "next/font/local";
import { AnalyticsConsentControl } from "@/src/analytics/consent-control";
import { createBrandMetadata } from "@/src/brand/metadata";
import type { ReactNode } from "react";

import "./globals.css";

// Latin-subset variable faces vendored under app/fonts; see app/fonts/README.md.
const displayFont = localFont({
  src: "./fonts/bricolage-grotesque-latin-variable.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-bricolage-grotesque",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const bodyFont = localFont({
  src: "./fonts/dm-sans-latin-variable.woff2",
  weight: "100 1000",
  style: "normal",
  display: "swap",
  variable: "--font-dm-sans",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const metadata = createBrandMetadata();

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} font-body`}
    >
      <body>
        {children}
        <AnalyticsConsentControl />
      </body>
    </html>
  );
}
