/** @type {import('next').NextConfig} */
// Use basePath for production, empty for local dev (set NEXT_PUBLIC_BASE_PATH="" for local)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH === ""
  ? undefined  // No basePath for local dev
  : process.env.NEXT_PUBLIC_BASE_PATH || "/us/oregon-kicker-refund";

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "policyengine.org",
        pathname: "/assets/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
