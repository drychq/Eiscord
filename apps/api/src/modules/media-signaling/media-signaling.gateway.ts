import { HttpStatus } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

import {
  ErrorCode,
  voiceConsumerCreatedRequestSchema,
  voiceConsumerResumedRequestSchema,
  voiceProducerCreatedRequestSchema,
  voiceRouterCapabilitiesRequestSchema,
  voiceTransportConnectRequestSchema,
  voiceTransportCreatedRequestSchema,
} from '@eiscord/shared';

import { AppError } from '../../core/errors/app-error';
import { createApiErrorResponse, createApiSuccessResponse } from '../../core/http/api-response.factory';
import type { RealtimeSocket } from '../realtime/realtime.gateway';
import { MediaSignalingService } from './media-signaling.service';

@WebSocketGateway({
  cors: {
    origin: true,
  },
  namespace: '/realtime',
})
export class MediaSignalingGateway {
  constructor(private readonly mediaSignalingService: MediaSignalingService) {}

  @SubscribeMessage('VoiceRouterCapabilities')
  async handleRouterCapabilities(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() payload: unknown) {
    const user = this.requireUser(socket);
    const requestId = getSocketRequestId(socket);
    const parsed = voiceRouterCapabilitiesRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return this.error(ErrorCode.ValidationFailed, 'Invalid voice router capabilities payload.', requestId);
    }

    try {
      const session = await this.mediaSignalingService.getActiveSessionForUser(parsed.data.session_id, user);
      const router = await this.mediaSignalingService.prepareRouter(session.channelId);

      return createApiSuccessResponse(
        {
          router_id: router.routerId,
          rtp_capabilities: router.rtpCapabilities,
        },
        requestId,
      );
    } catch (error) {
      return this.appError(error, requestId);
    }
  }

  @SubscribeMessage('VoiceTransportCreated')
  async handleTransportCreated(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() payload: unknown) {
    const user = this.requireUser(socket);
    const requestId = getSocketRequestId(socket);
    const parsed = voiceTransportCreatedRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return this.error(ErrorCode.ValidationFailed, 'Invalid voice transport payload.', requestId);
    }

    try {
      const session = await this.mediaSignalingService.getActiveSessionForUser(parsed.data.session_id, user);
      const result = await this.mediaSignalingService.createTransport(user, session, parsed.data.direction);

      return createApiSuccessResponse(result, requestId);
    } catch (error) {
      return this.appError(error, requestId);
    }
  }

  @SubscribeMessage('VoiceTransportConnect')
  async handleTransportConnect(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() payload: unknown) {
    const user = this.requireUser(socket);
    const requestId = getSocketRequestId(socket);
    const parsed = voiceTransportConnectRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return this.error(ErrorCode.ValidationFailed, 'Invalid voice transport connect payload.', requestId);
    }

    try {
      const session = await this.mediaSignalingService.getActiveSessionForUser(parsed.data.session_id, user);
      const result = await this.mediaSignalingService.connectSessionTransport(
        user,
        session,
        parsed.data.transport_id,
        parsed.data.dtls_parameters,
      );

      return createApiSuccessResponse(result, requestId);
    } catch (error) {
      return this.appError(error, requestId);
    }
  }

  @SubscribeMessage('VoiceProducerCreated')
  async handleProducerCreated(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() payload: unknown) {
    const user = this.requireUser(socket);
    const requestId = getSocketRequestId(socket);
    const parsed = voiceProducerCreatedRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return this.error(ErrorCode.ValidationFailed, 'Invalid voice producer payload.', requestId);
    }

    try {
      const session = await this.mediaSignalingService.getActiveSessionForUser(parsed.data.session_id, user);
      const result = await this.mediaSignalingService.produce(
        user,
        session,
        parsed.data.transport_id,
        parsed.data.kind,
        parsed.data.rtp_parameters,
      );

      return createApiSuccessResponse(result, requestId);
    } catch (error) {
      return this.appError(error, requestId);
    }
  }

  @SubscribeMessage('VoiceConsumerCreated')
  async handleConsumerCreated(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() payload: unknown) {
    const user = this.requireUser(socket);
    const requestId = getSocketRequestId(socket);
    const parsed = voiceConsumerCreatedRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return this.error(ErrorCode.ValidationFailed, 'Invalid voice consumer payload.', requestId);
    }

    try {
      const session = await this.mediaSignalingService.getActiveSessionForUser(parsed.data.session_id, user);
      const result = await this.mediaSignalingService.consume(
        user,
        session,
        parsed.data.producer_id,
        parsed.data.rtp_capabilities,
      );

      return createApiSuccessResponse(result, requestId);
    } catch (error) {
      return this.appError(error, requestId);
    }
  }

  @SubscribeMessage('VoiceConsumerResumed')
  async handleConsumerResumed(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() payload: unknown) {
    const user = this.requireUser(socket);
    const requestId = getSocketRequestId(socket);
    const parsed = voiceConsumerResumedRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return this.error(ErrorCode.ValidationFailed, 'Invalid voice consumer resume payload.', requestId);
    }

    try {
      const session = await this.mediaSignalingService.getActiveSessionForUser(parsed.data.session_id, user);
      const result = await this.mediaSignalingService.resumeConsumer(user, session, parsed.data.consumer_id);

      return createApiSuccessResponse(result, requestId);
    } catch (error) {
      return this.appError(error, requestId);
    }
  }

  private requireUser(socket: RealtimeSocket) {
    const user = socket.data.user;

    if (!user) {
      throw new AppError(ErrorCode.AuthRequired, 'Authentication is required.', HttpStatus.UNAUTHORIZED);
    }

    return user;
  }

  private appError(error: unknown, requestId: string) {
    if (error instanceof AppError) {
      return this.error(error.code, error.message, requestId, error.details);
    }

    return this.error(ErrorCode.InternalError, 'Internal server error', requestId);
  }

  private error(code: ErrorCode, message: string, requestId: string, details?: Record<string, unknown>) {
    return createApiErrorResponse({ code, details, message, requestId });
  }
}

function getSocketRequestId(socket: RealtimeSocket): string {
  const header = socket.handshake.headers['x-request-id'];
  const requestId = Array.isArray(header) ? header[0] : header;

  return requestId && requestId.length > 0 ? requestId : socket.id;
}
