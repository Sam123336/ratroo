import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Cloudflare-only worker and D1 files are validated by the Vinext build.
    // Vercel type-checks the shared app and API route surface instead.
    tsconfigPath: "tsconfig.vercel.json",
  },
};

export default nextConfig;
