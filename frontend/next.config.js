/** @type {import('next').NextConfig} */
// Use basePath for production, empty for local dev (set NEXT_PUBLIC_BASE_PATH="" for local)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH === ""
  ? undefined  // No basePath for local dev
  : process.env.NEXT_PUBLIC_BASE_PATH || "/us/oregon-kicker-refund";

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  output: "standalone",
};

module.exports = nextConfig;
