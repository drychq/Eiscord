import { chromium, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';

import {
  VOICE_TEST_IDS,
  getMediaWorkerPid,
  joinVoiceAndAwaitConnected,
  killMediaWorker,
  loginAs,
  measureFrequencyPower,
  navigateToVoiceRoom,
  waitForRemoteAudio,
} from './helpers/voice';

const TONE_ALICE = resolve(__dirname, 'fixtures/audio/tone-1khz.wav');
const TONE_BOB = resolve(__dirname, 'fixtures/audio/tone-600hz.wav');

const COMMON_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

const ALICE_TONE_HZ = 1000;
const BOB_TONE_HZ = 600;
const ACTIVE_DB_FLOOR = -55; // dBFS — RTP-decoded tone should comfortably exceed this
const SILENCE_DROP_DB = 20; // active − muted should differ at least this much

const PASSWORD = 'DemoPass1';
const apiBase = `${process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:14400'}/api/v1`;

type Participant = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

async function bootParticipant(tonePath: string, username: string): Promise<Participant> {
  const browser = await chromium.launch({
    args: [...COMMON_ARGS, `--use-file-for-fake-audio-capture=${tonePath}`],
  });
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:14500',
    permissions: ['microphone'],
  });
  const page = await context.newPage();
  await loginAs(page, username, PASSWORD);
  await navigateToVoiceRoom(page);
  return { browser, context, page };
}

async function teardown(participant: Participant): Promise<void> {
  try {
    await participant.context.close();
  } catch {
    /* ignore */
  }
  try {
    await participant.browser.close();
  } catch {
    /* ignore */
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('voice media — real audio negotiation (AC-03 / AC-N2 / AC-N6)', () => {
  test('alice ↔ bob 互听音频、静音生效、退出释放', async () => {
    const alice = await bootParticipant(TONE_ALICE, 'alice');
    const bob = await bootParticipant(TONE_BOB, 'bob');

    try {
      // Alice joins first, then Bob joins against an already-active Producer.
      const aliceTimings = await joinVoiceAndAwaitConnected(alice.page, 8000);
      const bobTimings = await joinVoiceAndAwaitConnected(bob.page, 8000);
      expect.soft(aliceTimings.totalMs).toBeLessThanOrEqual(3000);
      expect.soft(bobTimings.totalMs).toBeLessThanOrEqual(3000);

      // Each side must materialise the other side's <audio> element with a live MediaStream
      await waitForRemoteAudio(alice.page, VOICE_TEST_IDS.bob);
      await waitForRemoteAudio(bob.page, VOICE_TEST_IDS.alice);

      // ~1s warm-up for jitter buffers / first RTP packets
      await alice.page.waitForTimeout(1000);

      // Alice should hear Bob's 600 Hz tone
      const aliceHearsBob = await measureFrequencyPower(alice.page, VOICE_TEST_IDS.bob, BOB_TONE_HZ);
      expect(aliceHearsBob, `alice receives bob's ${BOB_TONE_HZ} Hz at ${aliceHearsBob} dBFS`)
        .toBeGreaterThan(ACTIVE_DB_FLOOR);

      // Bob should hear Alice's 1 kHz tone
      const bobHearsAlice = await measureFrequencyPower(bob.page, VOICE_TEST_IDS.alice, ALICE_TONE_HZ);
      expect(bobHearsAlice, `bob receives alice's ${ALICE_TONE_HZ} Hz at ${bobHearsAlice} dBFS`)
        .toBeGreaterThan(ACTIVE_DB_FLOOR);

      // Mute alice → bob should observe a sharp drop in 1 kHz power within ~1.5s
      await alice.page.getByTestId('voice-mute').click();
      await alice.page.waitForTimeout(1500);
      const bobHearsAliceMuted = await measureFrequencyPower(bob.page, VOICE_TEST_IDS.alice, ALICE_TONE_HZ);
      expect(
        bobHearsAlice - bobHearsAliceMuted,
        `mute drop: active=${bobHearsAlice} muted=${bobHearsAliceMuted}`,
      ).toBeGreaterThan(SILENCE_DROP_DB);

      // Unmute → tone returns
      await alice.page.getByTestId('voice-mute').click();
      await alice.page.waitForTimeout(1500);
      const bobHearsAliceAfterUnmute = await measureFrequencyPower(bob.page, VOICE_TEST_IDS.alice, ALICE_TONE_HZ);
      expect(bobHearsAliceAfterUnmute).toBeGreaterThan(ACTIVE_DB_FLOOR);

      // Alice leaves → bob's [data-user-id=alice] audio element should disappear within 5s
      await alice.page.getByTestId('voice-leave').click();
      await bob.page.waitForFunction(
        (uid) => !document.querySelector(`audio[data-user-id="${uid}"]`),
        VOICE_TEST_IDS.alice,
        { timeout: 5_000 },
      );
    } finally {
      await Promise.allSettled([teardown(alice), teardown(bob)]);
    }
  });
});

test.describe('voice media — worker kill recovery (AC-E8, gated)', () => {
  test.skip(
    process.env.E2E_VOICE_KILL_WORKER !== 'true',
    'set E2E_VOICE_KILL_WORKER=true to enable mediasoup worker kill recovery',
  );

  test('mediasoup worker kill 后 5s 内自动重协商', async () => {
    const alice = await bootParticipant(TONE_ALICE, 'alice');
    const bob = await bootParticipant(TONE_BOB, 'bob');

    try {
      await Promise.all([
        joinVoiceAndAwaitConnected(alice.page, 8000),
        joinVoiceAndAwaitConnected(bob.page, 8000),
      ]);
      await waitForRemoteAudio(alice.page, VOICE_TEST_IDS.bob);
      await waitForRemoteAudio(bob.page, VOICE_TEST_IDS.alice);

      const pid = await getMediaWorkerPid(apiBase);
      expect(pid).not.toBeNull();
      await killMediaWorker(apiBase);

      // After kill: status should drop to reconnecting, then back to connected within 5s
      const recoveryDeadline = 5_000;
      await expect(alice.page.getByTestId('voice-status')).toHaveAttribute(
        'data-voice-status',
        'connected',
        { timeout: recoveryDeadline + 5_000 },
      );
      await expect(bob.page.getByTestId('voice-status')).toHaveAttribute(
        'data-voice-status',
        'connected',
        { timeout: recoveryDeadline + 5_000 },
      );

      // Audio should resume
      await waitForRemoteAudio(alice.page, VOICE_TEST_IDS.bob, 8_000);
      // ~1s warm-up for jitter buffers / first RTP packets after worker respawn
      await alice.page.waitForTimeout(1000);
      const aliceHearsBob = await measureFrequencyPower(alice.page, VOICE_TEST_IDS.bob, BOB_TONE_HZ);
      expect(aliceHearsBob).toBeGreaterThan(ACTIVE_DB_FLOOR);
    } finally {
      await Promise.allSettled([teardown(alice), teardown(bob)]);
    }
  });
});
