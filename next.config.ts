import type { NextConfig } from "next";

const securityHeaders = [
  // Clickjacking: only our own frames
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer privacy — never leak paths (incl. tokens in URLs) cross-origin
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Browser features the app doesn't need
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Force HTTPS for 2 years, include subdomains
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Isolate the app from speculative side-channel attacks
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Never index API routes or user data
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to everything except static assets (which are safe to cache publicly)
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
