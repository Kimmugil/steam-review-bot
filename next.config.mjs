/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
