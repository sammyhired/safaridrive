import type { NextConfig } from "next";

// ---- Content-Security-Policy ----
// Dev server (next dev, NODE_ENV=development): permissive — Turbopack HMR
// needs 'unsafe-eval' and an open ws:// allowance for the HMR websocket.
// Production (next start / standalone): tightened — 'unsafe-eval' is gone,
// websocket wildcards are gone (the tracking socket is same-origin, which
// 'self' covers), so exfiltration and XSS payload-execution surfaces shrink.
// Note: script-src keeps 'unsafe-inline' in production because the App Router
// delivers its flight payload as inline <script> tags; a nonce-based policy
// requires a per-request middleware — see README "Security model" for the
// upgrade path.
const isDev = process.env.NODE_ENV === "development";

const cspCommon = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const csp = [
  ...cspCommon,
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  // Do not advertise the framework (X-Powered-By) — free fingerprint removal.
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
