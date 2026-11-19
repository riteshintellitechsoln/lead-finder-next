/** @type {import('next').NextConfig} */
const nextConfig = {
  // DuckDB is a native Node module: load it at runtime, don't bundle it
  serverExternalPackages: ['@duckdb/node-api', '@duckdb/node-bindings'],
  poweredByHeader: false,
  experimental: {
    // proxy.js makes Next.js copy every request body, and by default it keeps only the
    // first 10 MB: a bigger CSV upload (admin import, lists) was cut off without an error.
    proxyClientMaxBodySize: '1gb',
  },
  agentRules: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
