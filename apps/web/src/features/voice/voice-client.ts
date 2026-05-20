import { Device } from 'mediasoup-client';
import type { ConnectionState, Consumer, Producer, Transport } from 'mediasoup-client/types';
import type {
  IceServer,
  JoinVoiceMediaResponse,
  RealtimeEventEnvelope,
  VoiceActiveProducer,
} from '@eiscord/shared';

import * as socketClient from '../../shared/api/socket-client';

export type VoiceClientStatus = 'idle' | 'negotiating' | 'connected' | 'reconnecting' | 'failed';

type RemoteTrackListener = (userId: string, stream: MediaStream | null) => void;
type ActiveSpeakerListener = (userId: string | null, audioLevel: number) => void;
type StatusListener = (status: VoiceClientStatus) => void;
type WorkerDiedListener = () => void;

export type VoiceClientStartInput = {
  sessionId: string;
  channelId: string;
  userId: string;
  media: JoinVoiceMediaResponse;
  initialMuted: boolean;
};

export type VoiceClient = {
  start(input: VoiceClientStartInput): Promise<void>;
  stop(reason?: string): Promise<void>;
  syncRemoteProducers(producers: VoiceActiveProducer[]): void;
  setMuted(muted: boolean): void;
  setDeafened(deafened: boolean): void;
  status(): VoiceClientStatus;
  isStarted(): boolean;
  onRemoteTrack(listener: RemoteTrackListener): () => void;
  onActiveSpeaker(listener: ActiveSpeakerListener): () => void;
  onStatusChange(listener: StatusListener): () => void;
  onWorkerDied(listener: WorkerDiedListener): () => void;
};

type RemoteProducerEvent = VoiceActiveProducer & { created_at?: string };

type RemoteProducerClosedEvent = {
  channel_id: string;
  producer_id: string;
  user_id: string;
  reason: string;
};

type ActiveSpeakerEvent = {
  channel_id: string;
  user_id: string | null;
  audio_level: number;
};

type TransportCreatedResponse = {
  transport_id: string;
  ice_parameters: Record<string, unknown>;
  ice_candidates: Record<string, unknown>[];
  dtls_parameters: Record<string, unknown>;
  ice_servers: IceServer[];
};

type ConsumerCreatedResponse = {
  consumer_id: string;
  kind: 'audio';
  rtp_parameters: Record<string, unknown>;
  producer_paused: boolean;
};

type RouterCapabilitiesResponse = {
  router_id: string;
  rtp_capabilities: Record<string, unknown>;
};

const STATUS_LOG_PREFIX = '[voice-client]';

function unwrapEvent<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null;
  if ('payload' in payload) {
    const envelope = payload as RealtimeEventEnvelope<T>;
    return (envelope.payload ?? null) as T | null;
  }
  return payload as T;
}

function toRTCIceServers(iceServers: IceServer[]): RTCIceServer[] {
  return iceServers.map((server) => ({
    urls: server.urls,
    username: server.username,
    credential: server.credential,
    credentialType: 'password',
  }));
}

export function createVoiceClient(): VoiceClient {
  let status: VoiceClientStatus = 'idle';
  let started = false;
  let startInput: VoiceClientStartInput | null = null;
  let device: Device | null = null;
  let sendTransport: Transport | null = null;
  let recvTransport: Transport | null = null;
  let producer: Producer | null = null;
  let micStream: MediaStream | null = null;
  const consumers = new Map<string, Consumer>();
  const consumerUsers = new Map<string, string>();
  const pendingProducers = new Map<string, RemoteProducerEvent>();
  const remoteTrackListeners = new Set<RemoteTrackListener>();
  const activeSpeakerListeners = new Set<ActiveSpeakerListener>();
  const statusListeners = new Set<StatusListener>();
  const workerDiedListeners = new Set<WorkerDiedListener>();
  const socketUnregisters: Array<() => void> = [];

  function setStatus(next: VoiceClientStatus) {
    if (status === next) return;
    status = next;
    for (const listener of statusListeners) {
      try {
        listener(status);
      } catch {
        // swallow
      }
    }
  }

  function emitRemoteTrack(userId: string, stream: MediaStream | null) {
    for (const listener of remoteTrackListeners) {
      try {
        listener(userId, stream);
      } catch {
        // swallow
      }
    }
  }

  function emitActiveSpeaker(userId: string | null, level: number) {
    for (const listener of activeSpeakerListeners) {
      try {
        listener(userId, level);
      } catch {
        // swallow
      }
    }
  }

  function emitWorkerDied() {
    for (const listener of workerDiedListeners) {
      try {
        listener();
      } catch {
        // swallow
      }
    }
  }

  function bindSocketListener(eventName: string, handler: (raw: unknown) => void) {
    socketClient.on(eventName, handler);
    socketUnregisters.push(() => socketClient.off(eventName, handler));
  }

  async function consumeRemoteProducer(event: RemoteProducerEvent): Promise<void> {
    if (!startInput || !device || !recvTransport) return;
    if (event.user_id === startInput.userId) return;
    if (event.channel_id !== startInput.channelId) return;
    if (consumers.has(event.producer_id)) return;

    try {
      const response = await socketClient.request<ConsumerCreatedResponse>('VoiceConsumerCreated', {
        session_id: startInput.sessionId,
        producer_id: event.producer_id,
        rtp_capabilities: device.rtpCapabilities,
      });
      const consumer = await recvTransport.consume({
        id: response.consumer_id,
        producerId: event.producer_id,
        kind: response.kind,
        rtpParameters: response.rtp_parameters as never,
      });
      await socketClient.request<{ ok: true }>('VoiceConsumerResumed', {
        consumer_id: response.consumer_id,
        session_id: startInput.sessionId,
      });
      consumer.resume();
      consumers.set(event.producer_id, consumer);
      consumerUsers.set(event.producer_id, event.user_id);
      consumer.on('transportclose', () => {
        consumers.delete(event.producer_id);
        consumerUsers.delete(event.producer_id);
        emitRemoteTrack(event.user_id, null);
      });
      const stream = new MediaStream([consumer.track]);
      emitRemoteTrack(event.user_id, stream);
    } catch (error) {
      console.warn(`${STATUS_LOG_PREFIX} consume failed for ${event.producer_id}:`, error);
    }
  }

  function queueOrConsumeRemoteProducer(event: RemoteProducerEvent) {
    if (!startInput) return;
    if (event.channel_id !== startInput.channelId) return;
    if (event.user_id === startInput.userId) return;
    if (consumers.has(event.producer_id)) return;

    if (!device || !device.loaded || !recvTransport) {
      pendingProducers.set(event.producer_id, event);
      return;
    }
    void consumeRemoteProducer(event);
  }

  function handleRemoteProducerCreated(raw: unknown) {
    const event = unwrapEvent<RemoteProducerEvent>(raw);
    if (!event) return;
    queueOrConsumeRemoteProducer(event);
  }

  function handleRemoteProducerClosed(raw: unknown) {
    const event = unwrapEvent<RemoteProducerClosedEvent>(raw);
    if (!event) return;
    pendingProducers.delete(event.producer_id);
    const consumer = consumers.get(event.producer_id);
    if (consumer) {
      consumer.close();
      consumers.delete(event.producer_id);
      consumerUsers.delete(event.producer_id);
      emitRemoteTrack(event.user_id, null);
    }
    if (event.reason === 'worker_died' && started) {
      handleWorkerDied();
    }
  }

  function handleVoiceMemberLeft(raw: unknown) {
    const event = unwrapEvent<{ channel_id: string; user_id: string; reason?: string }>(raw);
    if (!event || !startInput) return;
    if (event.channel_id !== startInput.channelId) return;
    if (event.user_id !== startInput.userId) return;
    if (event.reason === 'worker_died' && started) {
      handleWorkerDied();
    }
  }

  function handleActiveSpeaker(raw: unknown) {
    const event = unwrapEvent<ActiveSpeakerEvent>(raw);
    if (!event || !startInput) return;
    if (event.channel_id !== startInput.channelId) return;
    emitActiveSpeaker(event.user_id, event.audio_level);
  }

  function handleTransportStateChange(name: 'send' | 'recv', state: ConnectionState) {
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      console.warn(`${STATUS_LOG_PREFIX} ${name} transport entered ${state}`);
      if (started && status === 'connected') {
        setStatus('reconnecting');
      }
    } else if (state === 'connected' && status !== 'connected') {
      if (sendTransport && recvTransport && producer && !producer.closed) {
        setStatus('connected');
      }
    }
  }

  function handleWorkerDied() {
    if (!started) return;
    console.warn(`${STATUS_LOG_PREFIX} mediasoup worker died — signaling UI to rejoin`);
    setStatus('reconnecting');
    void teardownMedia();
    started = false;
    startInput = null;
    while (socketUnregisters.length > 0) {
      const off = socketUnregisters.pop();
      try {
        off?.();
      } catch {
        /* ignore */
      }
    }
    emitWorkerDied();
  }

  async function negotiate(input: VoiceClientStartInput): Promise<void> {
    setStatus('negotiating');
    const router = await socketClient.request<RouterCapabilitiesResponse>('VoiceRouterCapabilities', {
      channel_id: input.channelId,
      session_id: input.sessionId,
    });
    device = new Device();
    await device.load({ routerRtpCapabilities: router.rtp_capabilities as never });

    const iceServers = toRTCIceServers(input.media.ice_servers);
    for (const event of input.media.active_producers) {
      if (event.user_id !== input.userId) {
        pendingProducers.set(event.producer_id, event);
      }
    }

    const [sendParams, recvParams] = await Promise.all([
      socketClient.request<TransportCreatedResponse>('VoiceTransportCreated', {
        session_id: input.sessionId,
        direction: 'send',
      }),
      socketClient.request<TransportCreatedResponse>('VoiceTransportCreated', {
        session_id: input.sessionId,
        direction: 'recv',
      }),
    ]);

    sendTransport = device.createSendTransport({
      id: sendParams.transport_id,
      iceParameters: sendParams.ice_parameters as never,
      iceCandidates: sendParams.ice_candidates as never,
      dtlsParameters: sendParams.dtls_parameters as never,
      iceServers,
    });
    recvTransport = device.createRecvTransport({
      id: recvParams.transport_id,
      iceParameters: recvParams.ice_parameters as never,
      iceCandidates: recvParams.ice_candidates as never,
      dtlsParameters: recvParams.dtls_parameters as never,
      iceServers,
    });

    sendTransport.on(
      'connect',
      ({ dtlsParameters }: { dtlsParameters: unknown }, callback: () => void, errback: (error: Error) => void) => {
        socketClient
          .request<{ ok: true }>('VoiceTransportConnect', {
            session_id: input.sessionId,
            transport_id: sendParams.transport_id,
            dtls_parameters: dtlsParameters,
          })
          .then(() => callback())
          .catch((error) => errback(error instanceof Error ? error : new Error(String(error))));
      },
    );
    recvTransport.on(
      'connect',
      ({ dtlsParameters }: { dtlsParameters: unknown }, callback: () => void, errback: (error: Error) => void) => {
        socketClient
          .request<{ ok: true }>('VoiceTransportConnect', {
            session_id: input.sessionId,
            transport_id: recvParams.transport_id,
            dtls_parameters: dtlsParameters,
          })
          .then(() => callback())
          .catch((error) => errback(error instanceof Error ? error : new Error(String(error))));
      },
    );
    sendTransport.on(
      'produce',
      (
        { kind, rtpParameters }: { kind: 'audio' | 'video'; rtpParameters: unknown },
        callback: (response: { id: string }) => void,
        errback: (error: Error) => void,
      ) => {
        socketClient
          .request<{ producer_id: string }>('VoiceProducerCreated', {
            session_id: input.sessionId,
            transport_id: sendParams.transport_id,
            kind,
            rtp_parameters: rtpParameters,
          })
          .then((response) => callback({ id: response.producer_id }))
          .catch((error) => errback(error instanceof Error ? error : new Error(String(error))));
      },
    );
    sendTransport.on('connectionstatechange', (state: ConnectionState) => handleTransportStateChange('send', state));
    recvTransport.on('connectionstatechange', (state: ConnectionState) => handleTransportStateChange('recv', state));

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    const track = micStream.getAudioTracks()[0];
    if (!track) {
      throw new Error('No audio track available from getUserMedia');
    }
    track.enabled = !input.initialMuted;
    producer = await sendTransport.produce({
      track,
      codecOptions: { opusDtx: true } as never,
    });

    // Flush existing producers plus broadcasts queued while transports were starting.
    const queued = Array.from(pendingProducers.values());
    pendingProducers.clear();
    for (const event of queued) {
      void consumeRemoteProducer(event);
    }
  }

  async function teardownMedia(): Promise<void> {
    for (const consumer of consumers.values()) {
      try {
        consumer.close();
      } catch {
        /* ignore */
      }
    }
    consumers.clear();
    consumerUsers.clear();
    if (producer && !producer.closed) {
      try {
        producer.close();
      } catch {
        /* ignore */
      }
    }
    producer = null;
    if (sendTransport && !sendTransport.closed) {
      try {
        sendTransport.close();
      } catch {
        /* ignore */
      }
    }
    sendTransport = null;
    if (recvTransport && !recvTransport.closed) {
      try {
        recvTransport.close();
      } catch {
        /* ignore */
      }
    }
    recvTransport = null;
    if (micStream) {
      for (const track of micStream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
      micStream = null;
    }
    device = null;
  }

  return {
    async start(input) {
      if (started) {
        await this.stop('restart');
      }
      started = true;
      startInput = input;
      pendingProducers.clear();
      bindSocketListener('VoiceProducerCreated', handleRemoteProducerCreated);
      bindSocketListener('VoiceProducerClosed', handleRemoteProducerClosed);
      bindSocketListener('VoiceMemberLeft', handleVoiceMemberLeft);
      bindSocketListener('VoiceActiveSpeaker', handleActiveSpeaker);
      try {
        await negotiate(input);
        setStatus('connected');
      } catch (error) {
        console.error(`${STATUS_LOG_PREFIX} start failed:`, error);
        started = false;
        startInput = null;
        pendingProducers.clear();
        while (socketUnregisters.length > 0) {
          const off = socketUnregisters.pop();
          try {
            off?.();
          } catch {
            /* ignore */
          }
        }
        await teardownMedia();
        setStatus('failed');
        throw error;
      }
    },
    async stop(reason) {
      started = false;
      startInput = null;
      pendingProducers.clear();
      while (socketUnregisters.length > 0) {
        const off = socketUnregisters.pop();
        try {
          off?.();
        } catch {
          /* ignore */
        }
      }
      await teardownMedia();
      setStatus('idle');
      if (reason) {
        console.info(`${STATUS_LOG_PREFIX} stopped: ${reason}`);
      }
    },
    syncRemoteProducers(producers) {
      const activeProducerIds = new Set(producers.map((event) => event.producer_id));

      for (const event of producers) {
        queueOrConsumeRemoteProducer(event);
      }
      for (const [producerId, consumer] of consumers) {
        if (activeProducerIds.has(producerId)) continue;

        const userId = consumerUsers.get(producerId);
        try {
          consumer.close();
        } catch {
          /* ignore */
        }
        consumers.delete(producerId);
        consumerUsers.delete(producerId);
        if (userId) {
          emitRemoteTrack(userId, null);
        }
      }
      for (const producerId of pendingProducers.keys()) {
        if (!activeProducerIds.has(producerId)) {
          pendingProducers.delete(producerId);
        }
      }
    },
    setMuted(muted) {
      if (!micStream) return;
      for (const track of micStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    },
    setDeafened(_deafened) {
      // deafen is enforced on the UI layer (audio elements); kept for symmetry
    },
    status() {
      return status;
    },
    isStarted() {
      return started;
    },
    onRemoteTrack(listener) {
      remoteTrackListeners.add(listener);
      return () => {
        remoteTrackListeners.delete(listener);
      };
    },
    onActiveSpeaker(listener) {
      activeSpeakerListeners.add(listener);
      return () => {
        activeSpeakerListeners.delete(listener);
      };
    },
    onStatusChange(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    onWorkerDied(listener) {
      workerDiedListeners.add(listener);
      return () => {
        workerDiedListeners.delete(listener);
      };
    },
  };
}

export const voiceClient = createVoiceClient();

if (typeof window !== 'undefined') {
  // expose for Playwright e2e introspection only
  (window as unknown as { __eiscordVoiceClient?: VoiceClient }).__eiscordVoiceClient = voiceClient;
}
