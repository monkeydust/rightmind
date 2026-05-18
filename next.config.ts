import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["192.168.178.58"],
  serverExternalPackages: ["pdf-parse", "resend", "next-auth", "@auth/prisma-adapter"],
};

export default nextConfig;
