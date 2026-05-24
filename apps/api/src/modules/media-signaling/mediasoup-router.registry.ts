import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { RealtimeEvent, VoiceConnectionStatus, VoiceMediaState } from '@eiscord/shared';

import { PrismaService } from '../../common/persistence/prisma.service';
import { buildRealtimeRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { MediasoupWorkerClient, type WorkerEvent } from './mediasoup-worker.client';

type RouterResult = {
  routerId: string;
  rtpCapabilities: Record<string, unknown>;
};

type AudioLevelPayload = {
  audioLevel: number | null;
  channelId: string;
  userId: string | null;
};

type AffectedSessionRow = {
  id: string;
  channelId: string;
  userId: string;
  producerId: string | null;
};

@Injectable()
export class MediasoupRouterRegistry implements OnModuleInit {
  private readonly logger = new Logger(MediasoupRouterRegistry.name);
  private readonly routers = new Map<string, RouterResult>();
  private readonly lastAudioLevelAt = new Map<string, number>();

  constructor(
    private readonly workerClient: MediasoupWorkerClient,
    private readonly publisher: RealtimePublisher,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.workerClient.onEvent((event) => this.handleWorkerEvent(event));
  }

  async getOrCreateRouter(channelId: string): Promise<RouterResult> {
    const existing = this.routers.get(channelId);

    if (existing) {
      return existing;
    }

    const created = await this.workerClient.request<RouterResult>('createRouter', { channelId });
    await this.workerClient.request('createAudioLevelObserver', {
      channelId,
      routerId: created.routerId,
    });
    this.routers.set(channelId, created);

    return created;
  }

  removeRouter(channelId: string) {
    this.routers.delete(channelId);
  }

  private handleWorkerEvent(event: WorkerEvent) {
    if (event.event === 'worker_died') {
      void this.handleWorkerDied();
      return;
    }

    if (event.event !== 'audiolevels') {
      return;
    }

    const payload = event.payload as Partial<AudioLevelPayload>;

    if (!payload.channelId) {
      return;
    }

    const now = Date.now();
    const last = this.lastAudioLevelAt.get(payload.channelId) ?? 0;

    if (now - last < 500) {
      return;
    }

    this.lastAudioLevelAt.set(payload.channelId, now);
    this.publisher.publishToRoom(
      buildRealtimeRoom('voice', payload.channelId),
      RealtimeEvent.VoiceActiveSpeaker,
      {
        audio_level: payload.audioLevel ?? 0,
        channel_id: payload.channelId,
        observed_at: new Date().toISOString(),
        user_id: payload.userId ?? null,
      },
    );
  }

  private async handleWorkerDied(): Promise<void> {
    const affectedChannelIds = Array.from(this.routers.keys());
    this.routers.clear();
    this.lastAudioLevelAt.clear();

    if (affectedChannelIds.length === 0) {
      this.logger.warn('mediasoup worker died with no active routers tracked.');
      return;
    }

    this.logger.warn(
      `mediasoup worker died — releasing ${affectedChannelIds.length} channel router(s) and active voice sessions.`,
    );

    for (const channelId of affectedChannelIds) {
      try {
        const sessions = await this.prisma.$queryRaw<AffectedSessionRow[]>`
          UPDATE voice_sessions
          SET
            connection_status = ${VoiceConnectionStatus.Disconnected},
            media_state = ${VoiceMediaState.Failed},
            negotiation_deadline = NULL,
            ended_at = COALESCE(ended_at, NOW()),
            updated_at = NOW()
          WHERE channel_id = ${channelId}::uuid
            AND ended_at IS NULL
          RETURNING
            id,
            channel_id AS "channelId",
            user_id AS "userId",
            producer_id AS "producerId"
        `;

        const room = buildRealtimeRoom('voice', channelId);
        const closedAt = new Date().toISOString();

        for (const session of sessions) {
          if (session.producerId) {
            this.publisher.publishToRoom(
              room,
              RealtimeEvent.VoiceProducerClosed,
              {
                channel_id: channelId,
                closed_at: closedAt,
                producer_id: session.producerId,
                reason: 'worker_died',
                user_id: session.userId,
              },
            );
          }

          this.publisher.leaveUserRooms([session.userId], room);
          this.publisher.publishToRoom(
            room,
            RealtimeEvent.VoiceMemberLeft,
            {
              channel_id: channelId,
              left_at: closedAt,
              reason: 'worker_died',
              user_id: session.userId,
            },
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to release voice sessions for channel ${channelId} after worker death: ${String(error)}`,
        );
      }
    }
  }
}
