import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CookieNotice, Footer, Header, Topbar } from "@/components/shell";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
export const metadata: Metadata = { title: { default: "The RegEx Collective", template: "%s · The RegEx Collective" }, description: "Precision network infrastructure from blueprint to bandwidth." };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en" className={`${geist.variable} ${mono.variable}`}><body><a className="skip" href="#main">Skip to content</a><Topbar /><Header /><main id="main">{children}</main><Footer /><CookieNotice /></body></html>; }
