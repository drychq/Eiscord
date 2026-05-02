import { HttpStatus, Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import {
  ApiErrorResponse,
  ErrorCode,
  RealtimeScopeType,
  realtimeHeartbeatPayloadSchema,
  realtimeSubscribePayloadSchema,
} from '@eiscord/shared';

import { TOKEN_VERIFIER } from '../../common/auth/auth.types';
import type { AuthenticatedUserContext, TokenVerifier } from '../../common/auth/auth.types';
import { extractBearerToken } from '../../common/auth/token.utils';
import { AppError } from '../../common/errors/app-error';
import { createApiErrorResponse, createApiSuccessResponse } from '../../common/http/api-response.factory';
import { PermissionAction, PermissionResourceType } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { isRecord } from '../../common/utils/is-record';
import { AuditService } from '../audit/audit.service';
import { buildRealtimeRoom, buildUserRoom } from './realtime.rooms';
import { RealtimePublisher } from './realtime.publisher';

type RealtimeSocketData = {
  connectedAt?: string;
  user?: AuthenticatedUserContext;
};

export type RealtimeSocket = Socket & {
  data: RealtimeSocketData;
};

type SocketSuccessPayload = {
  ok: true;
  room?: string;
  server_time?: string;
};

@WebSocketGateway({
  cors: {
    origin: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    @Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
    private readonly permissionsService: PermissionsService,
    private readonly publisher: RealtimePublisher,
    private readonly auditService: AuditService,
  ) {}

  afterInit(server: Server) {
    this.publisher.bindServer(server);
  }

  async handleConnection(socket: RealtimeSocket) {
    const requestId = getSocketRequestId(socket);
    const token = getSocketToken(socket);

    if (!token) {
      this.emitSocketError(socket, ErrorCode.AuthRequired, 'Authentication is required.', requestId);
      socket.disconnect(true);
      return;
    }

    const user = await this.tokenVerifier.verifyAccessToken(token);

    if (!user || user.accountStatus === 'disabled') {
      this.emitSocketError(socket, ErrorCode.AuthRequired, 'Access token is invalid.', requestId);
      socket.disconnect(true);
      return;
    }

    socket.data.user = user;
    socket.data.connectedAt = new Date().toISOString();
    socket.join(buildUserRoom(user.userId));

    await this.auditService.record({
      action: 'RealtimeConnect',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: socket.id,
      targetType: 'socket_connection',
    });
  }

  async handleDisconnect(socket: RealtimeSocket) {
    const user = socket.data.user;

    if (!user) {
      return;
    }

    await this.auditService.record({
      action: 'RealtimeDisconnect',
      actorId: user.userId,
      requestId: getSocketRequestId(socket),
      result: 'success',
      targetId: socket.id,
      targetType: 'socket_connection',
    });
  }

  @SubscribeMessage('Subscribe')
  async handleSubscribe(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() payload: unknown,
  ) {
    const user = socket.data.user;
    const requestId = getSocketRequestId(socket);

    if (!user) {
      return this.emitSocketError(
        socket,
        ErrorCode.AuthRequired,
        'Authentication is required.',
        requestId,
      );
    }

    const parsed = realtimeSubscribePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      return this.emitSocketError(
        socket,
        ErrorCode.ValidationFailed,
        'Invalid realtime subscription payload.',
        requestId,
        { validation_errors: parsed.error.issues.map((issue) => issue.message) },
      );
    }

    const room = buildRealtimeRoom(parsed.data.scope_type, parsed.data.scope_id);

    if (parsed.data.scope_type === 'user') {
      if (parsed.data.scope_id !== user.userId) {
        return this.emitSocketError(
          socket,
          ErrorCode.PermissionDenied,
          'Cannot subscribe to another user room.',
          requestId,
        );
      }

      socket.join(room);
      return createApiSuccessResponse<SocketSuccessPayload>({ ok: true, room }, requestId);
    }

    try {
      await this.permissionsService.assertAllowed({
        action: PermissionAction.SubscribeRealtime,
        requestId,
        resource: {
          id: parsed.data.scope_id,
          type: mapScopeToResourceType(parsed.data.scope_type),
        },
        user,
      });
    } catch (error) {
      return this.emitAppError(socket, error, requestId);
    }

    socket.join(room);
    return createApiSuccessResponse<SocketSuccessPayload>({ ok: true, room }, requestId);
  }

  @SubscribeMessage('Unsubscribe')
  handleUnsubscribe(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() payload: unknown) {
    const requestId = getSocketRequestId(socket);
    const parsed = realtimeSubscribePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      return this.emitSocketError(
        socket,
        ErrorCode.ValidationFailed,
        'Invalid realtime unsubscribe payload.',
        requestId,
        { validation_errors: parsed.error.issues.map((issue) => issue.message) },
      );
    }

    const room = buildRealtimeRoom(parsed.data.scope_type, parsed.data.scope_id);
    socket.leave(room);

    return createApiSuccessResponse<SocketSuccessPayload>({ ok: true, room }, requestId);
  }

  @SubscribeMessage('Heartbeat')
  handleHeartbeat(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() payload: unknown) {
    const requestId = getSocketRequestId(socket);
    const parsed = realtimeHeartbeatPayloadSchema.safeParse(payload ?? {});

    if (!parsed.success) {
      return this.emitSocketError(
        socket,
        ErrorCode.ValidationFailed,
        'Invalid realtime heartbeat payload.',
        requestId,
        { validation_errors: parsed.error.issues.map((issue) => issue.message) },
      );
    }

    this.logger.debug(`Heartbeat received from socket ${socket.id}`);

    return createApiSuccessResponse<SocketSuccessPayload>(
      { ok: true, server_time: new Date().toISOString() },
      requestId,
    );
  }

  private emitAppError(socket: RealtimeSocket, error: unknown, requestId: string): ApiErrorResponse {
    if (error instanceof AppError) {
      return this.emitSocketError(socket, error.code, error.message, requestId, error.details);
    }

    return this.emitSocketError(
      socket,
      ErrorCode.InternalError,
      'Internal server error',
      requestId,
    );
  }

  private emitSocketError(
    socket: RealtimeSocket,
    code: ErrorCode,
    message: string,
    requestId?: string,
    details?: Record<string, unknown>,
  ): ApiErrorResponse {
    const response = createApiErrorResponse({ code, message, requestId, details });
    socket.emit('Error', response);
    return response;
  }
}

function getSocketToken(socket: Socket): string | null {
  const auth = socket.handshake.auth;

  if (isRecord(auth) && typeof auth.token === 'string') {
    return auth.token;
  }

  return extractBearerToken(socket.handshake.headers.authorization);
}

function getSocketRequestId(socket: Socket): string {
  const header = socket.handshake.headers['x-request-id'];
  const requestId = Array.isArray(header) ? header[0] : header;

  return requestId && requestId.length > 0 ? requestId : socket.id;
}

function mapScopeToResourceType(scopeType: RealtimeScopeType): PermissionResourceType {
  if (scopeType === 'dm') {
    return 'dm';
  }

  if (scopeType === 'voice') {
    return 'voice';
  }

  if (scopeType === 'server') {
    return 'server';
  }

  if (scopeType === 'channel') {
    return 'channel';
  }

  throw new AppError(
    ErrorCode.ValidationFailed,
    'Unsupported realtime subscription scope.',
    HttpStatus.BAD_REQUEST,
  );
}
