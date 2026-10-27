/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native Node module: load it at runtime, don't bundle it
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
