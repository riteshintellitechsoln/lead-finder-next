/** @type {import('next').NextConfig} */
const nextConfig = {
  // DuckDB is a native Node module: load it at runtime, don't bundle it
  serverExternalPackages: ['@duckdb/node-api', '@duckdb/node-bindings'],
  poweredByHeader: false,
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
