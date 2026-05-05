import { spawn } from 'node:child_process';
import treeKill from 'tree-kill';

let serverProcess = null;
const PORT = 5174;

async function waitForReady(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status === 401 || r.status === 200 || r.status === 404) {
        return;
      }
    } catch {
      // 继续等
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite dev did not start within ${timeoutMs}ms`);
}

export async function setup() {
  serverProcess = spawn(
    'npx',
    ['vite', 'dev', '--host', '127.0.0.1', '--port', String(PORT)],
    {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FUNCTIONS_DB_PATH: ':memory:',
      },
    }
  );

  serverProcess.stdout?.on('data', (d) => {
    if (process.env.VITEST_VERBOSE) {
      process.stdout.write(`[vite] ${d}`);
    }
  });
  serverProcess.stderr?.on('data', (d) => {
    if (process.env.VITEST_VERBOSE) {
      process.stderr.write(`[vite:err] ${d}`);
    }
  });

  await waitForReady(`http://127.0.0.1:${PORT}/api/auth/me`);
  process.env.TEST_BASE_URL = `http://127.0.0.1:${PORT}`;
}

export async function teardown() {
  if (serverProcess?.pid) {
    await new Promise((resolve) => {
      treeKill(serverProcess.pid, 'SIGTERM', () => resolve());
    });
  }
}
