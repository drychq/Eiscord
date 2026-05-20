import { createServer } from 'node:http';

import * as mediasoup from 'mediasoup';
import type { types } from 'mediasoup';

type AudioLevelObserver = types.AudioLevelObserver;
type Consumer = types.Consumer;
type Producer = types.Producer;
type Router = types.Router;
type WebRtcTransport = types.WebRtcTransport;
type Worker = types.Worker;

type RpcRequest = {
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

type RpcResponse = {
  error?: string;
  id: string;
  result?: unknown;
};

type RpcEvent = {
  event: string;
  payload: unknown;
};

type RouterRecord = {
  audioLevelObserver?: AudioLevelObserver;
  router: Router;
  worker: Worker;
};

type TransportRecord = {
  channelId: string;
  direction: 'send' | 'recv';
  routerId: string;
  transport: WebRtcTransport;
};

type ProducerRecord = {
  channelId: string;
  producer: Producer;
  userId: string;
};

type ConsumerRecord = {
  consumer: Consumer;
  transportId: string;
};

const workers: Worker[] = [];
const routers = new Map<string, RouterRecord>();
const transports = new Map<string, TransportRecord>();
const producers = new Map<string, ProducerRecord>();
const consumers = new Map<string, ConsumerRecord>();
let nextWorkerIndex = 0;

async function main() {
  const workerCount = readPositiveInt('MEDIASOUP_NUM_WORKERS', 1);

  for (let index = 0; index < workerCount; index += 1) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: readPositiveInt('MEDIASOUP_RTC_MIN_PORT', 40000),
      rtcMaxPort: readPositiveInt('MEDIASOUP_RTC_MAX_PORT', 40100),
    });

    worker.on('died', (error) => {
      emitEvent('worker_died', { error: String(error), pid: worker.pid });
    });
    workers.push(worker);
  }

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string | Buffer) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();

      if (trimmed.length === 0) {
        continue;
      }

      void handleLine(trimmed);
    }
  });

  startHealthServer();
}

async function handleLine(line: string) {
  let request: RpcRequest;

  try {
    request = JSON.parse(line) as RpcRequest;
  } catch {
    return;
  }

  try {
    const result = await handleRequest(request);
    writeResponse({ id: request.id, result });
  } catch (error) {
    writeResponse({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
}

async function handleRequest(request: RpcRequest): Promise<unknown> {
  const params = request.params ?? {};

  switch (request.method) {
    case 'createRouter':
      return createRouter(String(params.channelId));
    case 'createWebRtcTransport':
      return createWebRtcTransport(
        String(params.channelId),
        String(params.routerId),
        params.direction === 'recv' ? 'recv' : 'send',
      );
    case 'connectTransport':
      return connectTransport(String(params.transportId), params.dtlsParameters as Record<string, unknown>);
    case 'produce':
      return produce(
        String(params.transportId),
        String(params.userId),
        params.rtpParameters as Record<string, unknown>,
      );
    case 'consume':
      return consume(
        String(params.transportId),
        String(params.producerId),
        params.rtpCapabilities as Record<string, unknown>,
      );
    case 'resumeConsumer':
      return resumeConsumer(String(params.consumerId), String(params.transportId));
    case 'pauseProducer':
      return pauseProducer(String(params.producerId));
    case 'resumeProducer':
      return resumeProducer(String(params.producerId));
    case 'closeProducer':
      return closeProducer(String(params.producerId));
    case 'closeTransport':
      return closeTransport(String(params.transportId));
    case 'releaseSession':
      return releaseSession(params.transportIds as string[] | undefined, params.producerId as string | undefined);
    case 'createAudioLevelObserver':
      return createAudioLevelObserver(String(params.routerId), String(params.channelId));
    default:
      throw new Error(`Unsupported media worker method: ${request.method}`);
  }
}

async function createRouter(channelId: string) {
  const existing = routers.get(channelId);

  if (existing) {
    return {
      routerId: existing.router.id,
      rtpCapabilities: existing.router.rtpCapabilities,
    };
  }

  const worker = pickWorker();
  const router = await worker.createRouter({
    mediaCodecs: [
      {
        channels: 2,
        clockRate: 48000,
        kind: 'audio',
        mimeType: 'audio/opus',
        preferredPayloadType: 100,
      },
    ],
  });

  router.observer.on('close', () => {
    routers.delete(channelId);
    emitEvent('router_closed', { channelId, routerId: router.id });
  });
  routers.set(channelId, { router, worker });

  return {
    routerId: router.id,
    rtpCapabilities: router.rtpCapabilities,
  };
}

async function createWebRtcTransport(channelId: string, routerId: string, direction: 'send' | 'recv') {
  const routerRecord = getRouterById(routerId);
  const listenIp = process.env.MEDIASOUP_LISTEN_IP ?? '127.0.0.1';
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;
  const transport = await routerRecord.router.createWebRtcTransport({
    enableTcp: true,
    enableUdp: true,
    listenInfos: [
      {
        announcedAddress: announcedIp,
        ip: listenIp,
        protocol: 'udp',
      },
      {
        announcedAddress: announcedIp,
        ip: listenIp,
        protocol: 'tcp',
      },
    ],
    preferUdp: true,
  });

  transports.set(transport.id, { channelId, direction, routerId, transport });
  transport.observer.on('close', () => {
    transports.delete(transport.id);
  });

  return {
    dtlsParameters: transport.dtlsParameters,
    iceCandidates: transport.iceCandidates,
    iceParameters: transport.iceParameters,
    transportId: transport.id,
  };
}

async function connectTransport(transportId: string, dtlsParameters: Record<string, unknown>) {
  const record = getTransport(transportId);
  await record.transport.connect({ dtlsParameters: dtlsParameters as never });

  return { ok: true };
}

async function produce(transportId: string, userId: string, rtpParameters: Record<string, unknown>) {
  const transportRecord = getTransport(transportId);
  const producer = await transportRecord.transport.produce({
    kind: 'audio',
    rtpParameters: rtpParameters as never,
  });

  producers.set(producer.id, {
    channelId: transportRecord.channelId,
    producer,
    userId,
  });
  producer.observer.on('close', () => {
    producers.delete(producer.id);
  });

  const routerRecord = routers.get(transportRecord.channelId);
  await routerRecord?.audioLevelObserver?.addProducer({ producerId: producer.id });

  return {
    producerId: producer.id,
  };
}

async function consume(transportId: string, producerId: string, rtpCapabilities: Record<string, unknown>) {
  const transportRecord = getTransport(transportId);
  const routerRecord = getRouterById(transportRecord.routerId);

  if (!routerRecord.router.canConsume({ producerId, rtpCapabilities: rtpCapabilities as never })) {
    throw new Error('Router cannot consume producer with provided RTP capabilities.');
  }

  const consumer = await transportRecord.transport.consume({
    paused: true,
    producerId,
    rtpCapabilities: rtpCapabilities as never,
  });

  consumers.set(consumer.id, { consumer, transportId });
  consumer.observer.on('close', () => {
    consumers.delete(consumer.id);
  });

  return {
    consumerId: consumer.id,
    kind: consumer.kind,
    producerPaused: consumer.producerPaused,
    rtpParameters: consumer.rtpParameters,
  };
}

async function resumeConsumer(consumerId: string, transportId: string) {
  const record = getConsumer(consumerId);

  if (record.transportId !== transportId) {
    throw new Error('Consumer does not belong to the requested receive transport.');
  }

  await record.consumer.resume();

  return { ok: true };
}

async function pauseProducer(producerId: string) {
  const record = getProducer(producerId);
  await record.producer.pause();

  return { ok: true };
}

async function resumeProducer(producerId: string) {
  const record = getProducer(producerId);
  await record.producer.resume();

  return { ok: true };
}

function closeProducer(producerId: string) {
  const record = producers.get(producerId);

  if (record) {
    record.producer.close();
    producers.delete(producerId);
  }

  return { ok: true };
}

function closeTransport(transportId: string) {
  const record = transports.get(transportId);

  if (record) {
    record.transport.close();
    transports.delete(transportId);
  }

  return { ok: true };
}

function releaseSession(transportIds: string[] = [], producerId?: string) {
  if (producerId) {
    closeProducer(producerId);
  }

  for (const transportId of transportIds) {
    closeTransport(transportId);
  }

  return { ok: true };
}

async function createAudioLevelObserver(routerId: string, channelId: string) {
  const routerRecord = getRouterById(routerId);

  if (routerRecord.audioLevelObserver) {
    return { observerId: routerRecord.audioLevelObserver.id };
  }

  const observer = await routerRecord.router.createAudioLevelObserver({
    interval: 500,
    maxEntries: 1,
    threshold: -80,
  });

  observer.on('volumes', (volumes: types.AudioLevelObserverVolume[]) => {
    const first = volumes[0];
    const record = first ? producers.get(first.producer.id) : undefined;

    emitEvent('audiolevels', {
      audioLevel: first?.volume ?? null,
      channelId,
      producerId: first?.producer.id ?? null,
      userId: record?.userId ?? null,
    });
  });
  observer.on('silence', () => {
    emitEvent('audiolevels', {
      audioLevel: 0,
      channelId,
      producerId: null,
      userId: null,
    });
  });
  routerRecord.audioLevelObserver = observer;

  return { observerId: observer.id };
}

function pickWorker(): Worker {
  if (workers.length === 0) {
    throw new Error('No mediasoup workers are available.');
  }

  const worker = workers[nextWorkerIndex % workers.length];
  nextWorkerIndex += 1;

  return worker;
}

function getRouterById(routerId: string): RouterRecord {
  for (const record of routers.values()) {
    if (record.router.id === routerId) {
      return record;
    }
  }

  throw new Error(`Mediasoup router not found: ${routerId}`);
}

function getTransport(transportId: string): TransportRecord {
  const record = transports.get(transportId);

  if (!record) {
    throw new Error(`Mediasoup transport not found: ${transportId}`);
  }

  return record;
}

function getProducer(producerId: string): ProducerRecord {
  const record = producers.get(producerId);

  if (!record) {
    throw new Error(`Mediasoup producer not found: ${producerId}`);
  }

  return record;
}

function getConsumer(consumerId: string): ConsumerRecord {
  const record = consumers.get(consumerId);

  if (!record) {
    throw new Error(`Mediasoup consumer not found: ${consumerId}`);
  }

  return record;
}

function writeResponse(response: RpcResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function emitEvent(event: string, payload: unknown) {
  const message: RpcEvent = { event, payload };
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function readPositiveInt(name: string, defaultValue: number): number {
  const value = Number(process.env[name]);

  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

function startHealthServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, workers: workers.length }));
  });

  const port = Number(process.env.MEDIA_HEALTH_PORT ?? 3001);

  server.on('error', (error: NodeJS.ErrnoException) => {
    const detail = error.code === 'EADDRINUSE'
      ? `media health port ${port} is already in use`
      : `media health server failed: ${error.message}`;
    process.stderr.write(`[media] ${detail}; continuing without health endpoint\n`);
  });

  server.listen(port);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
