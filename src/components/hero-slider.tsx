"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const slides = [
  { label: "Structured cabling", position: "right center", tone: "default" },
  { label: "Network operations", position: "center center", tone: "cool" },
  { label: "Security hardening", position: "right bottom", tone: "green" },
] as const;

export function HeroSlider() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive((index) => (index + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, []);

  return <section className="hero heroPhoto">
    <div className="heroSlides" aria-hidden="true">{slides.map((slide, index) => <div className={`heroSlide ${slide.tone} ${active === index ? "active" : ""}`} key={slide.label}><Image src="/hero-network.png" alt="" fill priority={index === 0} sizes="100vw" style={{ objectFit: "cover", objectPosition: slide.position }} /></div>)}</div>
    <div className="heroShade" aria-hidden="true" />
    <div className="wrap heroInner">
      <p className="pill"><b>Live</b> Surveys booking 2 weeks out</p>
      <h1>From blueprints<br />to bandwidth.</h1>
      <p className="lede">We design, optimise and fortify enterprise-grade networks, starting at the construction phase and carrying through security hardening and round-the-clock management.</p>
      <div className="actions"><Link className="btn" href="/contact">Request a site survey <span aria-hidden="true">→</span></Link><Link className="btn ghost heroGhost" href="/services">Explore services</Link></div>
      <div className="slideControl" aria-label="Hero image selection">{slides.map((slide, index) => <button key={slide.label} className={active === index ? "selected" : ""} onClick={() => setActive(index)} aria-label={`Show ${slide.label} image`} aria-pressed={active === index}><span />{slide.label}</button>)}</div>
      <dl className="stats"><div><dt>Cat6A and fiber</dt><dd>Structured cabling</dd></div><div><dt>MikroTik and Sophos</dt><dd>Firewall stack</dd></div><div><dt>24/7</dt><dd>Proactive monitoring</dd></div></dl>
    </div>
  </section>;
}
