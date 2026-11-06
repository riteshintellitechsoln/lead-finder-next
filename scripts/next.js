// Starts Next.js with a larger libuv thread pool.
//   node scripts/next.js dev | build | start [-p 3000]
// Each running DuckDB query occupies one libuv worker thread. Node's default of
// 4 would let a few heavy searches starve file reads and other async work, so
// we raise it before Next.js starts (it must be set before Node uses the pool,
// hence a child process). Works the same in PowerShell, cmd and bash.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const env = { ...process.env, UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '16' };
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...process.argv.slice(2)], { stdio: 'inherit', env });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
