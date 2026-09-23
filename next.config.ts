import type { NextConfig } from "next";

const allowedDevOrigins = process.env.DEV_ORIGIN
  ? [process.env.DEV_ORIGIN]
  : [];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  devIndicators: false,
};

export default nextConfig;