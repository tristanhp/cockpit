import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    // The old Cockpit screen became the Projets tab of Objectifs.
    return [{ source: "/cockpit", destination: "/objectifs?vue=projets", permanent: false }];
  },
  async headers() {
    return [
      // The service worker must always be re-fetched so an update is picked up.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
