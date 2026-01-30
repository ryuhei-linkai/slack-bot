import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@slack/bolt", "@slack/web-api"],
};

export default nextConfig;
