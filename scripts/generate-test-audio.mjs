#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * 生成 Playwright voice-media 验收所需的合成正弦波 WAV 文件。
 *
 * - 单声道 PCM16，48 kHz，5 秒（Chromium `--use-file-for-fake-audio-capture` 默认循环播放）。
 * - 幂等：若目标文件大小与预期相同则跳过。
 * - 无任何外部依赖，仅用 Node 标准库。
 */

import { writeFileSync, statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURES_DIR = resolve(REPO_ROOT, 'tests/e2e/fixtures/audio');

const SAMPLE_RATE = 48000;
const DURATION_SECONDS = 5;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const AMPLITUDE = 0.6; // -4.4 dBFS — loud enough for FFT analysis, no clipping

const TARGETS = [
  { fileName: 'tone-1khz.wav', frequencyHz: 1000 },
  { fileName: 'tone-600hz.wav', frequencyHz: 600 },
];

function buildWavBuffer(frequencyHz) {
  const numSamples = SAMPLE_RATE * DURATION_SECONDS;
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = numSamples * CHANNELS * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(headerSize - 8 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');

  // fmt chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32); // block align
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  // PCM samples
  const angularStep = (2 * Math.PI * frequencyHz) / SAMPLE_RATE;
  let phase = 0;
  for (let i = 0; i < numSamples; i += 1) {
    const sample = Math.sin(phase) * AMPLITUDE;
    const pcm = Math.max(-1, Math.min(1, sample)) * 0x7fff;
    buffer.writeInt16LE(Math.round(pcm), headerSize + i * bytesPerSample);
    phase += angularStep;
    if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
  }

  return buffer;
}

function ensureFixture(target) {
  const filePath = resolve(FIXTURES_DIR, target.fileName);
  const buffer = buildWavBuffer(target.frequencyHz);

  let existingSize = -1;
  try {
    existingSize = statSync(filePath).size;
  } catch {
    /* missing — will write */
  }

  if (existingSize === buffer.byteLength) {
    console.log(`[generate-test-audio] skip ${target.fileName} (size match)`);
    return;
  }

  mkdirSync(FIXTURES_DIR, { recursive: true });
  writeFileSync(filePath, buffer);
  console.log(
    `[generate-test-audio] wrote ${target.fileName} (${buffer.byteLength} bytes, ${target.frequencyHz} Hz)`,
  );
}

function main() {
  for (const target of TARGETS) {
    ensureFixture(target);
  }
}

main();
