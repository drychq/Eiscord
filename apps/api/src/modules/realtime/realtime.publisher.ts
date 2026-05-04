import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

import { RealtimeEvent, RealtimeEventEnvelope } from '@eiscord/shared';

@Injectable()
export class RealtimePublisher {
  private server?: Server;

  bindServer(server: Server) {
    this.server = server;
  }

  publishToRoom<TPayload>(
    room: string,
    eventName: RealtimeEvent,
    payload: TPayload,
    requestId?: string,
  ): RealtimeEventEnvelope<TPayload> {
    const envelope = this.createEnvelope(eventName, payload, requestId);

    this.server?.to(room).emit(eventName, envelope);

    return envelope;
  }

  leaveUserRooms(userIds: string[], rooms: string | string[]) {
    const targetRooms = Array.isArray(rooms) ? rooms : [rooms];

    for (const userId of userIds) {
      this.server?.in(`user:${userId}`).socketsLeave(targetRooms);
    }
  }

  createEnvelope<TPayload>(
    eventName: RealtimeEvent,
    payload: TPayload,
    requestId?: string,
  ): RealtimeEventEnvelope<TPayload> {
    return {
      event_id: randomUUID(),
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      payload,
      ...(requestId ? { request_id: requestId } : {}),
    };
  }
}
