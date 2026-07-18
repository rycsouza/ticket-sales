import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal packages are shipped as TypeScript source (ARQUITETURA §3).
  transpilePackages: ["@ingressos/core", "@ingressos/db", "@ingressos/config"],
  poweredByHeader: false,
  async headers() {
    // Baseline security headers (CLAUDE_SECURITY_RULES §21). CSP will be
    // tightened per-surface as pages are built.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
