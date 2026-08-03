"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
const links = [["/services","Services"],["/sectors","Who we serve"],["/process","Process"],["/contact","Contact"]] as const;
function Logo() { return <Link className="logo" href="/"><b>/</b><span>regex<em>collective</em></span></Link>; }
export function Topbar() { return <div className="topbar"><div className="wrap topbarInner"><p><i /> Now scheduling site surveys for new construction</p><span>Monday to Friday, 8am to 6pm <b /> 24/7 cover for managed clients</span></div></div>; }
export function Header() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { data: session } = authClient.useSession();

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <header className="nav">
      <div className="wrap navInner">
        <Logo />
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
export function Footer() { return <footer className="footer"><div className="wrap footerTop"><div className="footerBrand"><Logo /><p>Enterprise-grade network infrastructure, designed from the blueprint stage up.</p><dl><div><dt>Availability</dt><dd>Mon–Fri · 8am–6pm</dd></div><div><dt>Managed clients</dt><dd>24/7 monitoring</dd></div></dl></div><div><h2>Services</h2>{links.slice(0,1).map(([href,label])=><Link key={href} href={href}>{label}</Link>)}<Link href="/services#wireless">Wireless & RF</Link><Link href="/services#cabling">Structured cabling</Link><Link href="/services#firewall">Security hardening</Link></div><div><h2>Company</h2><Link href="/sectors">Who we serve</Link><Link href="/process">Our process</Link><Link href="/contact">Contact</Link></div><div><h2>Get in touch</h2><a href="mailto:hello@theregexcollective.com">hello@theregexcollective.com</a><Link href="/contact">Request a survey</Link></div></div><div className="wrap footerBottom"><p>© {new Date().getFullYear()} The RegEx Collective</p><p>Precision infrastructure, properly documented.</p><a href="#top">Back to top ↑</a></div></footer>; }
export function CookieNotice() { const [visible,setVisible]=useState(false); useEffect(()=>setVisible(!localStorage.getItem("regex-cookie-choice")),[]); const choose=(value:string)=>{localStorage.setItem("regex-cookie-choice",value);setVisible(false)}; if(!visible)return null; return <aside className="cookie" aria-label="Cookie notice"><div className="cookieHead"><span aria-hidden="true">○</span><h2>We use cookies</h2></div><p>We use only essential and optional analytics cookies. You can choose whether analytics is enabled.</p><div><button className="btn ghost" onClick={()=>choose("essential")}>Essential only</button><button className="btn" onClick={()=>choose("all")}>Accept analytics</button></div></aside>; }
