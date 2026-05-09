import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const localNoProxy = 'localhost,127.0.0.1,::1';
process.env.NO_PROXY = process.env.NO_PROXY
  ? `${process.env.NO_PROXY},${localNoProxy}`
  : localNoProxy;
process.env.no_proxy = process.env.no_proxy
  ? `${process.env.no_proxy},${localNoProxy}`
  : localNoProxy;

const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:44100';
const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:54100';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://eiscord:eiscord@localhost:5432/eiscord_test';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === 'true';
const apiPort = new URL(apiUrl).port;
const webPort = new URL(webUrl).port;
const mediaWorkerEntry = resolve(__dirname, 'apps/media/dist/main.js');

const COMMON_LAUNCH_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: webUrl,
    permissions: ['microphone'],
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    launchOptions: {
      args: COMMON_LAUNCH_ARGS,
    },
  },
  webServer: [
    {
      command: [
        'NODE_ENV=test',
        'REDIS_CONNECT_IN_TEST=true',
        'REALTIME_SWEEP_IN_TEST=true',
        'PRESENCE_SWEEP_INTERVAL_MS=100',
        'PRESENCE_OFFLINE_GRACE_MS=120',
        `PUBLIC_WEB_ORIGIN=${webUrl}`,
        `PORT=${apiPort}`,
        `DATABASE_URL=${databaseUrl}`,
        `MEDIA_WORKER_ENTRY=${mediaWorkerEntry}`,
        'MEDIASOUP_LISTEN_IP=127.0.0.1',
        'MEDIASOUP_RTC_MIN_PORT=40500',
        'MEDIASOUP_RTC_MAX_PORT=40550',
        'pnpm --filter @eiscord/api dev',
      ].join(' '),
      name: 'API',
      reuseExistingServer,
      timeout: 120_000,
      url: `${apiUrl}/api/v1/health`,
    },
    {
      command: [
        `PUBLIC_API_BASE_URL=${apiUrl}/api/v1`,
        `PUBLIC_REALTIME_URL=${apiUrl}/realtime`,
        `PORT=${webPort}`,
        'pnpm --filter @eiscord/web dev',
      ].join(' '),
      name: 'Web',
      reuseExistingServer,
      timeout: 120_000,
      url: webUrl,
    },
  ],
  workers: 1,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
