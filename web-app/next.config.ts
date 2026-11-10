import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,

  // The legal pages live on kreativekoala.llc (the app and the Play listing link there).
  // Send visitors who guess the audexa.app path to the same page instead of a 404.
  async redirects() {
    return [
      { source: "/privacy", destination: "https://kreativekoala.llc/privacy", permanent: false },
      { source: "/terms", destination: "https://kreativekoala.llc/terms", permanent: false },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=15552000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

  // Environment variables available at runtime
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ||
      "https://ai-radio-backend.fly.dev/api",
  },
};

export default nextConfig;
