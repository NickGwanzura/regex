import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CookieNotice, Footer, Header, Topbar } from "@/components/shell";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

const SITE_URL = "https://theregexcollective.com";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || SITE_URL,
  ),
  title: {
    default: "The RegEx Collective",
    template: "%s · The RegEx Collective",
  },
  description:
    "Precision network infrastructure from blueprint to bandwidth — site surveys, structured cabling, wireless & RF, and security hardening.",
  keywords: [
    "network infrastructure",
    "structured cabling",
    "wireless",
    "RF",
    "industry network design",
    "firewall",
    "site survey",
    "security hardening",
  ],
  authors: [{ name: "The RegEx Collective" }],
  creator: "The RegEx Collective",
  applicationName: "The RegEx Collective",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "The RegEx Collective",
    title: "The RegEx Collective",
    description:
      "Precision network infrastructure from blueprint to bandwidth — site surveys, structured cabling, wireless & RF, and security hardening.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "The RegEx Collective — precision network infrastructure",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The RegEx Collective",
    description:
      "Precision network infrastructure from blueprint to bandwidth.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  other: {
    "theme-color": "#0b0e10",
    "msapplication-TileColor": "#0b0e10",
  },
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en" className={`${geist.variable} ${mono.variable}`}><body><a className="skip" href="#main">Skip to content</a><Topbar /><Header /><main id="main">{children}</main><Footer /><CookieNotice /></body></html>; }
