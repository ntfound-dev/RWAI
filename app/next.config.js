/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias["@react-native-async-storage/async-storage"] = false;
    return config;
  },
};

module.exports = nextConfig;
