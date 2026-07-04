import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in a parent folder
  // (e.g. C:\Users\Ali\package-lock.json) can never confuse Turbopack again.
  turbopack: { root: __dirname },
};

export default nextConfig;
