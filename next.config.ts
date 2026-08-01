import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "standalone", async redirects() { return [{ source: "/index.html", destination: "/", permanent: true }, ...["services", "sectors", "process", "contact"].map(source => ({ source: `/${source}.html`, destination: `/${source}`, permanent: true }))]; } };
export default nextConfig;
