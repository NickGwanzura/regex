import Link from "next/link";

export default function Login() {
  return <section className="pageHead loginPage"><div className="wrap"><p className="eyebrow">Client portal</p><h1>Login is being prepared.</h1><p className="lede">Client access will be available here once the CRM is live. For now, contact the collective for project updates and support.</p><Link className="btn" href="/contact">Contact the collective</Link></div></section>;
}
