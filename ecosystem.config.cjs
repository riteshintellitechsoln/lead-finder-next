// pm2 config:  pm2 start ecosystem.config.cjs
// Must stay ONE instance in fork mode: a DuckDB file can be opened by only one process.
module.exports = {
  apps: [
    {
      name: 'lead-finder',
      script: 'scripts/next.js',
      args: 'start -p 3000',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        DUCKDB_MEMORY_LIMIT: '1GB',
      },
      max_memory_restart: '2500M',
      kill_timeout: 10000,
      time: true,
    },
  ],
};
