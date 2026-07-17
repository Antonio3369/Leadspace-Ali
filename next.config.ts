import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // N7 考核表可达 20MB+；默认 proxy 体积极限约 10MB 会导致 FormData 解析失败
  experimental: {
    proxyClientMaxBodySize: "64mb",
    serverActions: {
      bodySizeLimit: "64mb",
    },
  },
  async redirects() {
    return [
      { source: "/ledger", destination: "/xlh/ledger", permanent: false },
      { source: "/ledger/:path*", destination: "/xlh/ledger/:path*", permanent: false },
      { source: "/teams", destination: "/xlh/teams", permanent: false },
      { source: "/teams/:path*", destination: "/xlh/teams/:path*", permanent: false },
      { source: "/opportunities", destination: "/xlh/opportunities", permanent: false },
      {
        source: "/opportunities/:path*",
        destination: "/xlh/opportunities/:path*",
        permanent: false,
      },
      { source: "/members", destination: "/xlh/members", permanent: false },
      { source: "/members/:path*", destination: "/xlh/members/:path*", permanent: false },
      { source: "/admin", destination: "/xlh/admin/org", permanent: false },
      { source: "/admin/:path*", destination: "/xlh/admin/:path*", permanent: false },
      { source: "/screen", destination: "/xlh/screen", permanent: false },
      { source: "/screen/:path*", destination: "/xlh/screen/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
