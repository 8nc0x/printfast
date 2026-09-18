import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: repoRoot, // monorepo root — single lockfile
  // The shared packages are raw TS consumed from the monorepo; transpile them.
  transpilePackages: ['@printflow/shared', '@printflow/db'],
  // Native module — must not be bundled by webpack.
  serverExternalPackages: ['sharp'],
  output: 'standalone', // PM2 runs the standalone server (ecosystem.config.js)
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb', // uploads go through server actions
    },
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
