import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,

  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:3003";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        // Plain CSS Modules use Next.js's built-in scoped CSS pipeline.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
      },
    },
  },
};

export default nextConfig;
