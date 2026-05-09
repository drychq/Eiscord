import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WorkerEvent = {
  event: string;
  payload: unknown;
};

type PendingRequest = {
  reject: (reason?: unknown) => void;
  resolve: (value: unknown) => void;
};

@Injectable()
export class MediasoupWorkerClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediasoupWorkerClient.name);
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Set<(event: WorkerEvent) => void>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.start();
  }

  onModuleDestroy() {
    this.child?.kill('SIGTERM');
    this.child = null;
  }

  onEvent(listener: (event: WorkerEvent) => void) {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  async request<TResult>(method: string, params: Record<string, unknown> = {}): Promise<TResult> {
    if (!this.child) {
      this.start();
    }

    if (!this.child) {
      throw new Error('mediasoup worker process is not available.');
    }

    const id = randomUUID();
    const payload = JSON.stringify({ id, method, params });

    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.child?.stdin.write(`${payload}\n`);
    });
  }

  /** PID of the running worker child process, or null if not started. Test-only helper. */
  getPid(): number | null {
    return this.child?.pid ?? null;
  }

  /** Forcibly terminate the worker child process. Test-only helper. */
  killWorker(signal: NodeJS.Signals = 'SIGKILL'): boolean {
    if (!this.child) {
      return false;
    }
    return this.child.kill(signal);
  }

  private start() {
    if (this.child) {
      return;
    }

    const entry = process.env.MEDIA_WORKER_ENTRY ?? join(process.cwd(), '../media/dist/main.js');
    this.child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        MEDIASOUP_ANNOUNCED_IP: this.configService.get<string>('MEDIASOUP_ANNOUNCED_IP') ?? '',
        MEDIASOUP_LISTEN_IP: this.configService.get<string>('MEDIASOUP_LISTEN_IP') ?? '127.0.0.1',
        MEDIASOUP_NUM_WORKERS: String(this.configService.get<number>('MEDIASOUP_NUM_WORKERS') ?? 1),
        MEDIASOUP_RTC_MAX_PORT: String(this.configService.get<number>('MEDIASOUP_RTC_MAX_PORT') ?? 40100),
        MEDIASOUP_RTC_MIN_PORT: String(this.configService.get<number>('MEDIASOUP_RTC_MIN_PORT') ?? 40000),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const reader = createInterface({ input: this.child.stdout });
    reader.on('line', (line) => this.handleLine(line));
    this.child.stderr.on('data', (chunk) => {
      this.logger.warn(String(chunk));
    });
    this.child.on('exit', (code, signal) => {
      this.logger.warn(`mediasoup worker exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      this.child = null;
      for (const pending of this.pending.values()) {
        pending.reject(new Error('mediasoup worker exited.'));
      }
      this.pending.clear();
      this.emit({ event: 'worker_died', payload: { code, signal } });
    });
  }

  private handleLine(line: string) {
    let message: { error?: string; event?: string; id?: string; payload?: unknown; result?: unknown };

    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      this.logger.warn(`Invalid mediasoup worker output: ${line}`);
      return;
    }

    if (message.event) {
      this.emit({ event: message.event, payload: message.payload });
      return;
    }

    if (!message.id) {
      return;
    }

    const pending = this.pending.get(message.id);

    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error));
      return;
    }

    pending.resolve(message.result);
  }

  private emit(event: WorkerEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
