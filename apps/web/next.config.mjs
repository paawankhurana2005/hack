/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace types package so its TS source resolves cleanly.
  transpilePackages: ['@reloop/shared'],
};

export default nextConfig;
