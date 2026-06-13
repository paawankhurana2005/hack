/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace types package so its TS source resolves cleanly.
  transpilePackages: ['@reloop/shared'],
  webpack: (config) => {
    // @reloop/shared is raw TS using ESM ".js" import specifiers (e.g. "./impact.js").
    // Map ".js" → ".ts"/".tsx" so runtime (non-type) imports from it resolve.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
