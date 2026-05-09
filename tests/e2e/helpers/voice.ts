import { expect, type Page } from '@playwright/test';

const ALICE_ID = '10000000-0000-4000-8000-000000000001';
const BOB_ID = '10000000-0000-4000-8000-000000000002';
const SERVER_ID = '10000000-0000-4000-8000-000000000201';
const VOICE_CHANNEL_ID = '10000000-0000-4000-8000-000000000503';

export const VOICE_TEST_IDS = {
  alice: ALICE_ID,
  bob: BOB_ID,
  server: SERVER_ID,
  voiceChannel: VOICE_CHANNEL_ID,
} as const;

/** Logs in via the public login form. Reuses the production form selectors from auth.spec.ts. */
export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem('eiscord:auth');
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw) as { state?: { accessToken?: string | null } };
      return !!parsed.state?.accessToken;
    } catch {
      return false;
    }
  });
}

export async function navigateToVoiceRoom(
  page: Page,
  serverId: string = SERVER_ID,
  channelId: string = VOICE_CHANNEL_ID,
): Promise<void> {
  await page.goto(`/app/servers/${serverId}/voice/${channelId}`);
  await expect(page.getByTestId('voice-join').or(page.getByTestId('voice-leave'))).toBeVisible({ timeout: 15_000 });
}

export type JoinTimings = {
  totalMs: number;
};

/** Clicks 加入语音 and waits until voice-client status === 'connected'. */
export async function joinVoiceAndAwaitConnected(page: Page, timeoutMs = 10_000): Promise<JoinTimings> {
  const startedAt = Date.now();
  await page.getByTestId('voice-join').click();

  await expect(page.getByTestId('voice-status')).toHaveAttribute('data-voice-status', 'connected', {
    timeout: timeoutMs,
  });

  return { totalMs: Date.now() - startedAt };
}

/** Wait until a remote audio element for the given user appears with srcObject set. */
export async function waitForRemoteAudio(page: Page, userId: string, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    (uid) => {
      const el = document.querySelector(`audio[data-user-id="${uid}"]`) as HTMLAudioElement | null;
      return !!el && el.srcObject instanceof MediaStream && el.srcObject.getAudioTracks().length > 0;
    },
    userId,
    { timeout: timeoutMs },
  );
}

/**
 * Measure the FFT power (dBFS) of a remote audio element around a target frequency.
 * Returns the **maximum** power averaged over multiple samples, in dB.
 *
 * Implementation note: `createMediaElementSource` would detach playback from the default
 * destination. We use `createMediaStreamSource` on the element's `srcObject` MediaStream
 * directly, so the audio element keeps playing untouched and we tap a parallel branch.
 */
export async function measureFrequencyPower(
  page: Page,
  userId: string,
  targetFreqHz: number,
  sampleMs = 1500,
): Promise<number> {
  return page.evaluate(
    async ({ uid, freq, sampleMs }) => {
      const el = document.querySelector(`audio[data-user-id="${uid}"]`) as HTMLAudioElement | null;
      if (!el || !(el.srcObject instanceof MediaStream)) {
        throw new Error(`No audio element with srcObject for user ${uid}`);
      }
      const stream = el.srcObject;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      const fftSize = analyser.fftSize;
      const binCount = analyser.frequencyBinCount;
      const sampleRate = ctx.sampleRate;
      const targetBin = Math.round((freq * fftSize) / sampleRate);
      const halfWindow = Math.max(2, Math.ceil((40 * fftSize) / sampleRate));
      const data = new Float32Array(binCount);
      const samples: number[] = [];
      const start = performance.now();

      while (performance.now() - start < sampleMs) {
        analyser.getFloatFrequencyData(data);
        let peak = -Infinity;
        for (let b = Math.max(0, targetBin - halfWindow); b <= Math.min(binCount - 1, targetBin + halfWindow); b += 1) {
          if (data[b] > peak) peak = data[b];
        }
        if (Number.isFinite(peak)) samples.push(peak);
        await new Promise((r) => setTimeout(r, 50));
      }
      try {
        source.disconnect();
        await ctx.close();
      } catch {
        /* ignore */
      }

      if (samples.length === 0) return -Infinity;
      // Return the median of the top quartile to be robust against startup silence.
      samples.sort((a, b) => b - a);
      const topN = Math.max(1, Math.floor(samples.length / 4));
      const top = samples.slice(0, topN);
      return top.reduce((acc, v) => acc + v, 0) / top.length;
    },
    { uid: userId, freq: targetFreqHz, sampleMs },
  );
}

/**
 * Read media-worker pid via test-only debug route.
 * Requires the API to be in NODE_ENV=test mode.
 */
export async function getMediaWorkerPid(apiBase: string): Promise<number | null> {
  const response = await fetch(`${apiBase}/health/_test/media-worker-pid`);
  if (!response.ok) {
    throw new Error(`media-worker-pid endpoint returned ${response.status}`);
  }
  const json = (await response.json()) as { data?: { pid?: number | null } };
  return json.data?.pid ?? null;
}

export async function killMediaWorker(apiBase: string): Promise<void> {
  const response = await fetch(`${apiBase}/health/_test/kill-media-worker`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`kill-media-worker endpoint returned ${response.status}`);
  }
}
