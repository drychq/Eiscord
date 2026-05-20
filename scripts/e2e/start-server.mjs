#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const target = process.argv[2];
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:14400';
const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:14500';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://eiscord:eiscord@localhost:5432/eiscord_test';
const apiPort = new URL(apiUrl).port;
const webPort = new URL(webUrl).port;
const mediaWorkerEntry = resolve(repoRoot, 'apps/media/dist/main.js');
const apiEntry = resolve(repoRoot, 'apps/api/dist/main.js');
const webRoot = resolve(repoRoot, 'apps/web');
const viteEntry = resolve(webRoot, 'node_modules/vite/bin/vite.js');
const isWindows = process.platform === 'win32';

// 直接 spawn node 跑预编译入口，避免经过 pnpm.cmd / nest watch 等中间层产生孤儿进程
const serverConfigs = {
  api: {
    args: [apiEntry],
    env: {
      NODE_ENV: 'test',
      MEDIA_WORKER_START_IN_TEST: 'true',
      REDIS_CONNECT_IN_TEST: 'true',
      REALTIME_SWEEP_IN_TEST: 'true',
      PRESENCE_SWEEP_INTERVAL_MS: '100',
      PRESENCE_OFFLINE_GRACE_MS: '120',
      PUBLIC_WEB_ORIGIN: webUrl,
      PORT: apiPort,
      DATABASE_URL: databaseUrl,
      MEDIA_WORKER_ENTRY: mediaWorkerEntry,
      MEDIA_HEALTH_PORT: '0',
      MEDIASOUP_LISTEN_IP: '127.0.0.1',
      MEDIASOUP_RTC_MIN_PORT: '40500',
      MEDIASOUP_RTC_MAX_PORT: '40550',
    },
  },
  web: {
    // Vite 以 process.cwd() 作为项目根目录解析 index.html / vite.config.ts，
    // 必须在 apps/web 下启动，否则会在 repo 根找不到入口并对 / 返回 404。
    cwd: webRoot,
    args: [viteEntry, '--host', '0.0.0.0', '--port', webPort],
    env: {
      PUBLIC_API_BASE_URL: `${apiUrl}/api/v1`,
      PUBLIC_REALTIME_URL: `${apiUrl}/realtime`,
      PORT: webPort,
    },
  },
};

const config = serverConfigs[target];

if (!config) {
  console.error('Usage: node scripts/e2e/start-server.mjs <api|web>');
  process.exit(1);
}

const child = spawn(process.execPath, config.args, {
  cwd: config.cwd ?? repoRoot,
  detached: !isWindows,
  env: {
    ...process.env,
    ...config.env,
  },
  stdio: 'inherit',
});

const signalExitCodes = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};

let childExited = false;
let cleaningUp = false;

function killProcessTree(pid, signal = 'SIGTERM') {
  if (isWindows) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error;
    }
  }
}

function cleanupAndExit(signal) {
  if (cleaningUp) {
    return;
  }

  cleaningUp = true;

  if (child.pid && !childExited) {
    killProcessTree(child.pid, signal);
  }

  process.exit(signalExitCodes[signal] ?? 1);
}

for (const signal of Object.keys(signalExitCodes)) {
  process.on(signal, () => cleanupAndExit(signal));
}

child.on('error', (error) => {
  console.error(`Failed to start node ${config.args[0]}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  childExited = true;

  if (cleaningUp) {
    return;
  }

  if (signal) {
    console.error(`node exited with signal ${signal}`);
    process.exit(signalExitCodes[signal] ?? 1);
  }

  process.exit(code ?? 1);
});
