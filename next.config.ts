import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // N7 / 小绿盒运营原始表可达数十 MB；须与 nginx client_max_body_size 对齐
  experimental: {
    proxyClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
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
