import { defineConfig, devices } from '@playwright/test';

// 移除 HTTP 代理：e2e 内 API/Web 都在 localhost，绕过用户机器上的代理配置（否则 Playwright webServer URL polling 会经过代理超时）
for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
  delete process.env[key];
}

const localNoProxy = 'localhost,127.0.0.1,::1';
process.env.NO_PROXY = process.env.NO_PROXY
  ? `${process.env.NO_PROXY},${localNoProxy}`
  : localNoProxy;
process.env.no_proxy = process.env.no_proxy
  ? `${process.env.no_proxy},${localNoProxy}`
  : localNoProxy;

const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:14400';
const webUrl = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:14500';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === 'true';

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
      command: 'node scripts/e2e/start-server.mjs api',
      name: 'API',
      reuseExistingServer,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
      url: `${apiUrl}/api/v1/health`,
    },
    {
      command: 'node scripts/e2e/start-server.mjs web',
      name: 'Web',
      reuseExistingServer,
      stdout: 'pipe',
      stderr: 'pipe',
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
