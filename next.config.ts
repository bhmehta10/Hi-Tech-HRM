import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Some eSSL firmware calls the .aspx paths used by the vendor's own server.
  async rewrites() {
    return [
      { source: "/iclock/cdata.aspx", destination: "/iclock/cdata" },
      { source: "/iclock/getrequest.aspx", destination: "/iclock/getrequest" },
      { source: "/iclock/devicecmd.aspx", destination: "/iclock/devicecmd" },
    ];
  },
};

export default nextConfig;
