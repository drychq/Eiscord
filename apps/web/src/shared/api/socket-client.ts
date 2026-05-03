import { io, Socket } from 'socket.io-client';
import type { RealtimeScopeType } from '@eiscord/shared';
import { getPublicClientConfig } from './client-config';
import { useToastStore } from '../state/use-toast-store';

type EventHandler = (payload: unknown) => void;

let socket: Socket | null = null;
const eventHandlers = new Map<string, Set<EventHandler>>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

let onPermissionChangedCallback: (() => void) | null = null;

export function onPermissionChanged(cb: () => void): () => void {
  onPermissionChangedCallback = cb;
  return () => {
    if (onPermissionChangedCallback === cb) {
      onPermissionChangedCallback = null;
    }
  };
}

function notifyPermissionChanged(): void {
  if (onPermissionChangedCallback) {
    try {
      onPermissionChangedCallback();
    } catch {
      // swallow
    }
  }
}

export function connect(token: string): void {
  disconnect();

  const config = getPublicClientConfig();
  socket = io(config.realtimeUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    heartbeatTimer = setInterval(() => {
      socket?.emit('Heartbeat', {});
    }, 30_000);
  });

  socket.on('Error', (data: unknown) => {
    const code = (data as { error?: { code?: string; message?: string } })?.error?.code;
    const message =
      (data as { error?: { message?: string } })?.error?.message ?? 'Realtime error';
    useToastStore.getState().pushToast({
      kind: 'error',
      message: typeof code === 'string' ? `[${code}] ${message}` : message,
      ttl: 5000,
    });
  });

  socket.on('disconnect', () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  });

  socket.onAny((eventName: string, ...args: unknown[]) => {
    if (eventName === 'PermissionChanged') {
      notifyPermissionChanged();
    }

    const handlers = eventHandlers.get(eventName);
    if (handlers && args.length > 0) {
      handlers.forEach((handler) => {
        try {
          handler(args[0]);
        } catch {
          // swallow handler errors to keep other handlers alive
        }
      });
    }
  });
}

export function disconnect(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function subscribe(scopeType: RealtimeScopeType, scopeId: string): void {
  socket?.emit('Subscribe', { scope_type: scopeType, scope_id: scopeId });
}

export function unsubscribe(scopeType: RealtimeScopeType, scopeId: string): void {
  socket?.emit('Unsubscribe', { scope_type: scopeType, scope_id: scopeId });
}

export function on(eventName: string, handler: EventHandler): void {
  const handlers = eventHandlers.get(eventName) ?? new Set();
  handlers.add(handler);
  eventHandlers.set(eventName, handlers);
}

export function off(eventName: string, handler: EventHandler): void {
  const handlers = eventHandlers.get(eventName);
  if (handlers) {
    handlers.delete(handler);
    if (handlers.size === 0) {
      eventHandlers.delete(eventName);
    }
  }
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}
