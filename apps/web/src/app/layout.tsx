import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Absolute base for canonical + Open Graph URLs (set APP_BASE_URL in prod).
const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const DESCRIPTION =
  "Plataforma de venda e gestão de ingressos para produtoras regionais — eventos, promoters, financeiro e portaria em um só lugar.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  // No title template: existing pages already carry a "— Ingressos" suffix and
  // the event page sets a clean, share-friendly title of its own.
  title: "Ingressos — Venda e gestão de ingressos para produtoras",
  description: DESCRIPTION,
  applicationName: "Ingressos",
  openGraph: {
    type: "website",
    siteName: "Ingressos",
    locale: "pt_BR",
    url: appUrl,
    title: "Ingressos — Venda e gestão de ingressos para produtoras",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Ingressos",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

// Mobile-first (NFR-UX-001)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
