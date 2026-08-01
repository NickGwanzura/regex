import Link from "next/link";
import { Card, CTA, PageHeader, ServiceRow, Step } from "@/components/marketing";

const services = [
  ["Wireless range extension and infrastructure", "Precision RF signal mapping and high density access points for seamless roaming across large residential, commercial or industrial spaces."],
  ["Network optimisation and structured cabling", "Cat6 and Cat6A drops, fiber backbones, rack management and smart VLAN configurations that clear bottlenecks and cut latency."],
  ["Next generation firewalls and security", "Hardware firewalls, content filtering, deep packet inspection and isolated guest networks."],
  ["Managed network support", "Continuous uptime tracking, firmware updates and hands-on support, so an outage is never how you find out something went wrong."],
  ["Secure remote access and VPN", "Point-to-site and site-to-site VPNs with Zero Trust multi-factor authentication."],
];

export default function Home() {
  return <>
    <section className="hero"><div className="heroGrid" /><div className="wrap heroInner">
      <p className="pill"><b>Live</b> Surveys booking 2 weeks out</p>
      <h1>From blueprints<br />to bandwidth.</h1>
      <p className="lede">We design, optimise and fortify enterprise-grade networks, starting at the construction phase and carrying through security hardening and round-the-clock management.</p>
      <div className="actions"><Link className="btn" href="/contact">Request a site survey <Arrow /></Link><Link className="btn ghost" href="/services">Explore services</Link></div>
      <dl className="stats"><div><dt>Cat6A and fiber</dt><dd>Structured cabling</dd></div><div><dt>MikroTik and Sophos</dt><dd>Firewall stack</dd></div><div><dt>24/7</dt><dd>Proactive monitoring</dd></div></dl>
    </div></section>
    <section className="section"><div className="wrap"><PageHeader eyebrow="Why the collective" title="Networks fail at the foundation. So that is where we start." /><div className="grid three">
      <Card number="01" title="Construction first integration">We drop infrastructure while the walls are still open. No retrofits, no surface conduit, no tearing up finished work six months later.</Card>
      <Card number="02" title="Security as architecture">Segmentation, policy and hardware firewalls designed into the topology on day one, not bolted on after the first incident.</Card>
      <Card number="03" title="End-to-end uptime">One team owns installation, VPN management, patching and incident response. Nobody points a finger at another vendor.</Card>
    </div></div></section>
    <section className="section alt"><div className="wrap"><PageHeader eyebrow="Core services" title="Everything between the rack and the endpoint." link={{ href: "/services", label: "All services" }} /><ol className="services">{services.map(([title, description], i) => <ServiceRow key={title} number={i + 1} title={title}>{description}</ServiceRow>)}</ol></div></section>
    <section className="section"><div className="wrap"><PageHeader eyebrow="Who we serve" title="Built for the people who cannot afford downtime." link={{ href: "/sectors", label: "See sector detail" }} /><div className="grid three">
      <Card title="Developers and contractors">Integrate network drops during structural framing to deliver turnkey properties without disruption once the build is closed.</Card>
      <Card title="Commercial enterprises">Overhaul office Wi-Fi, organise server closets and isolate sensitive data from guest networks.</Card>
      <Card title="Distributed and remote teams">Link branches and remote employees back to core databases with hardened VPN encryption.</Card>
    </div></div></section>
    <section className="section alt"><div className="wrap"><PageHeader eyebrow="Process" title="Four steps. No surprises." link={{ href: "/process", label: "How we work" }} /><ol className="steps">{[["Blueprint and survey","We evaluate plans or run physical RF heat-map surveys."],["Infrastructure drop","Fiber, Cat6A, conduit routing, patch panels and rack management."],["Hardening and tuning","Firewall policy, VLAN segmentation and throughput optimisation."],["Proactive management","24/7 health tracking, patch maintenance and incident response."]].map(([t,d],i)=><Step key={t} number={i+1} title={t}>{d}</Step>)}</ol></div></section>
    <CTA title="A dependable network starts before the walls close." description="Tell us what you are building or where performance is falling short. We will start with a survey." />
  </>;
}
function Arrow() { return <span aria-hidden="true">→</span>; }
