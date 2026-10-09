import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Proxy only makes an optimistic session check, but Next still buffers its body.
    proxyClientMaxBodySize: "50mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
}

export default nextConfig
