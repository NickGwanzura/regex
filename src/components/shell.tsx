"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
const links = [["/services","Services"],["/sectors","Who we serve"],["/process","Process"],["/contact","Contact"]] as const;

// logo-dark.svg (LOGO1) is the dark-on-light lockup, logo-light.svg (LOGO2)
// the light-on-dark version. Width is derived from the SVG's aspect ratio.
const LOGO_ASPECT = 656.93 / 266.12;
function Logo({ variant = "dark", height = 36 }: { variant?: "dark" | "light"; height?: number }) {
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <Link aria-label="RegEx Collective — home" className="logo" href="/">
      <Image
        alt="RegEx Collective"
        height={height}
        priority
        src={variant === "light" ? "/logo-light.svg" : "/logo-dark.svg"}
        width={width}
      />
    </Link>
  );
}
export function Topbar() { return <div className="topbar"><div className="wrap topbarInner"><p><i /> Now scheduling site surveys for new construction</p><span>Monday to Friday, 8am to 6pm <b /> 24/7 cover for managed clients</span></div></div>; }
export function Header() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await authClient
      .signOut()
      .catch(() => ({ error: true }));
    if (error) {
      setSigningOut(false);
      return;
    }
    router.replace("/");
  }

  return (
    <header className="nav">
      <div className="wrap navInner">
        <Logo height={44} />
        <nav className="navLinks" aria-label="Primary">
          {links.map(([href, label]) => (
            <Link
              aria-current={path === href ? "page" : undefined}
              href={href}
              key={href}
            >
              {label}
              {label === "Services" && <small>⌄</small>}
            </Link>
          ))}
        </nav>
        <div className="navActions">
          {isAdmin && (
            <Link className="loginLink" href="/dashboard">
              Dashboard
            </Link>
          )}
          {session?.user ? (
            <button
              className="loginLink logoutLink"
              disabled={signingOut}
              onClick={handleSignOut}
              type="button"
            >
              {signingOut ? "Signing out…" : "Log out"}
            </button>
          ) : (
            <Link className="loginLink" href="/login">
              Log in
            </Link>
          )}
          <Link className="btn small navCta" href="/contact">
            Request survey
          </Link>
        </div>
        <button
          aria-expanded={open}
          aria-label="Toggle navigation"
          className="menuButton"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span />
          <span />
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="mobileNav">
          {links.map(([href, label]) => (
            <Link href={href} key={href} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/dashboard" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
          )}
          {session?.user ? (
            <button
              className="logoutBtn"
              disabled={signingOut}
              onClick={() => {
                setOpen(false);
                handleSignOut();
              }}
              type="button"
            >
              {signingOut ? "Signing out…" : "Log out"}
            </button>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)}>
              Log in
            </Link>
          )}
          <Link className="btn" href="/contact" onClick={() => setOpen(false)}>
            Request a survey
          </Link>
        </nav>
      )}
    </header>
  );
}
export function Footer() { return <footer className="footer"><div className="wrap footerTop"><div className="footerBrand"><Logo height={56} variant="light" /><p>Enterprise-grade network infrastructure, designed from the blueprint stage up.</p><dl><div><dt>Availability</dt><dd>Mon–Fri · 8am–6pm</dd></div><div><dt>Managed clients</dt><dd>24/7 monitoring</dd></div></dl></div><div><h2>Services</h2>{links.slice(0,1).map(([href,label])=><Link key={href} href={href}>{label}</Link>)}<Link href="/services#wireless">Wireless & RF</Link><Link href="/services#cabling">Structured cabling</Link><Link href="/services#firewall">Security hardening</Link></div><div><h2>Company</h2><Link href="/sectors">Who we serve</Link><Link href="/process">Our process</Link><Link href="/contact">Contact</Link></div><div><h2>Get in touch</h2><a href="mailto:hello@theregexcollective.com">hello@theregexcollective.com</a><Link href="/contact">Request a survey</Link></div></div><div className="wrap footerBottom"><p>© {new Date().getFullYear()} The RegEx Collective</p><p>Precision infrastructure, properly documented.</p><a href="#top">Back to top ↑</a><a href="https://spiritusglobal.tech" target="_blank" rel="noopener noreferrer">Developed by Spiritus Systems · spiritusglobal.tech</a></div></footer>; }
export function CookieNotice() { const [visible,setVisible]=useState(false); useEffect(()=>setVisible(!localStorage.getItem("regex-cookie-choice")),[]); const choose=(value:string)=>{localStorage.setItem("regex-cookie-choice",value);setVisible(false)}; if(!visible)return null; return <aside className="cookie" aria-label="Cookie notice"><div className="cookieHead"><span aria-hidden="true">○</span><h2>We use cookies</h2></div><p>We use only essential and optional analytics cookies. You can choose whether analytics is enabled.</p><div><button className="btn ghost" onClick={()=>choose("essential")}>Essential only</button><button className="btn" onClick={()=>choose("all")}>Accept analytics</button></div></aside>; }
