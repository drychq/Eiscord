#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const scriptsRoot = resolve(repoRoot, 'scripts');

const [scriptName, ...scriptArgs] = process.argv.slice(2);

if (!scriptName) {
  console.error('Usage: node scripts/run.mjs <script-path-without-extension> [args...]');
  process.exit(1);
}

const normalizedName = scriptName.replaceAll('\\', '/');
const isWindows = process.platform === 'win32';
const extension = isWindows ? 'ps1' : 'sh';
const scriptPath = resolve(scriptsRoot, `${normalizedName}.${extension}`);

if (!scriptPath.startsWith(`${scriptsRoot}${sep}`)) {
  console.error(`Invalid script path: ${scriptName}`);
  process.exit(1);
}

if (!existsSync(scriptPath)) {
  console.error(`Script not found for ${process.platform}: ${scriptPath}`);
  process.exit(1);
}

const command = isWindows ? 'powershell.exe' : 'bash';
const args = isWindows
  ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...scriptArgs]
  : [scriptPath, ...scriptArgs];

const child = spawn(command, args, {
  cwd: repoRoot,
  detached: !isWindows,
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
  console.error(`Failed to start ${command}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  childExited = true;

  if (cleaningUp) {
    return;
  }

  if (signal) {
    console.error(`${command} exited with signal ${signal}`);
    process.exit(signalExitCodes[signal] ?? 1);
  }

  process.exit(code ?? 1);
});
