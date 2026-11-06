/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Character art is generated locally as SVG data URIs by default.
    // Swap in remote hosts here when you point CHARACTER_IMAGE_BASE at a CDN.
    remotePatterns: [],
  },
};
export default nextConfig;
