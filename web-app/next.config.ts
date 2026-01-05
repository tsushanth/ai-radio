import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Environment variables available at runtime
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ||
      "https://ai-radio-backend-917362189743.us-central1.run.app/api",
  },
};

export default nextConfig;
