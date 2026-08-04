import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    dangerouslyAllowSVG: true,
    // Our SVGs are local static files with no scripts; keep the optimizer
    // strict anyway.
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async redirects() { return [{ source: "/index.html", destination: "/", permanent: true }, ...["services", "sectors", "process", "contact"].map(source => ({ source: `/${source}.html`, destination: `/${source}`, permanent: true }))]; } };
export default nextConfig;
