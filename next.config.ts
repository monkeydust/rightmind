import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["192.168.178.58"],
  serverExternalPackages: ["pdf-parse", "resend"],
};

export default nextConfig;
