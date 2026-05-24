import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IceServer, JoinVoiceMediaResponse } from '@eiscord/shared';

import * as socketClient from '../../shared/api/socket-client';
import { createVoiceClient, type VoiceClientStartInput } from './voice-client';

vi.mock('mediasoup-client', () => ({
  Device: vi.fn().mockImplementation(() => ({
    loaded: true,
    load: vi.fn().mockResolvedValue(undefined),
    rtpCapabilities: { codecs: [] },
  })),
}));

vi.mock('../../shared/api/socket-client', () => ({
  off: vi.fn(),
  on: vi.fn(),
  request: vi.fn(),
}));

const iceServer: IceServer = {
  credential: 'credential',
  credential_type: 'password',
  ttl_seconds: 300,
  urls: ['turn:localhost:3478?transport=udp'],
  username: '1714915200:user',
};

const media: JoinVoiceMediaResponse = {
  active_producers: [],
  ice_servers: [iceServer],
  router_rtp_capabilities: { codecs: [] },
  signaling_channel: 'voice:00000000-0000-4000-8000-000000000201',
};

const startInput: VoiceClientStartInput = {
  channelId: '00000000-0000-4000-8000-000000000201',
  initialMuted: false,
  media,
  sessionId: '00000000-0000-4000-8000-000000000301',
  userId: '00000000-0000-4000-8000-000000000001',
};

describe('voice-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cleans up started state and socket listeners after negotiation failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = vi.mocked(socketClient.request);
    request.mockImplementation(async (event) => {
      if (event === 'VoiceRouterCapabilities') {
        return {
          router_id: 'router-1',
          rtp_capabilities: { codecs: [] },
        };
      }
      if (event === 'VoiceTransportCreated') {
        throw new Error('mediasoup worker exited.');
      }
      throw new Error(`Unexpected voice request: ${event}`);
    });

    const client = createVoiceClient();

    await expect(client.start(startInput)).rejects.toThrow('mediasoup worker exited.');

    expect(client.status()).toBe('FAILED');
    expect(client.isStarted()).toBe(false);
    expect(socketClient.off).toHaveBeenCalledWith('VoiceProducerCreated', expect.any(Function));
    expect(socketClient.off).toHaveBeenCalledWith('VoiceProducerClosed', expect.any(Function));
    expect(socketClient.off).toHaveBeenCalledWith('VoiceMemberLeft', expect.any(Function));
    expect(socketClient.off).toHaveBeenCalledWith('VoiceActiveSpeaker', expect.any(Function));
    expect(consoleError).toHaveBeenCalledWith('[voice-client] start failed:', expect.any(Error));
    consoleError.mockRestore();
  });
});
