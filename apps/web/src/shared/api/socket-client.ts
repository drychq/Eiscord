import { io, Socket } from 'socket.io-client';
import type { RealtimeScopeType } from '@eiscord/shared';
import { getPublicClientConfig } from './client-config';
import { useToastStore } from '../state/use-toast-store';

type EventHandler = (payload: unknown) => void;

type PendingAck = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

let socket: Socket | null = null;
const eventHandlers = new Map<string, Set<EventHandler>>();
const subscriptions = new Set<string>();
const pendingAcks = new Set<PendingAck>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

let onPermissionChangedCallback: (() => void) | null = null;

type StateSyncCallback = (state: unknown) => void;
type ReconnectCallback = (attempt: number) => void;
type SimpleCallback = () => void;

const stateSyncCallbacks = new Set<StateSyncCallback>();
const reconnectingCallbacks = new Set<ReconnectCallback>();
const reconnectErrorCallbacks = new Set<ReconnectCallback>();
const reconnectFailedCallbacks = new Set<SimpleCallback>();

export function onPermissionChanged(cb: () => void): () => void {
  onPermissionChangedCallback = cb;
  return () => {
    if (onPermissionChangedCallback === cb) {
      onPermissionChangedCallback = null;
    }
  };
}

export function onStateSync(cb: StateSyncCallback): () => void {
  stateSyncCallbacks.add(cb);
  return () => { stateSyncCallbacks.delete(cb); };
}

export function onReconnecting(cb: ReconnectCallback): () => void {
  reconnectingCallbacks.add(cb);
  return () => { reconnectingCallbacks.delete(cb); };
}

export function onReconnectError(cb: ReconnectCallback): () => void {
  reconnectErrorCallbacks.add(cb);
  return () => { reconnectErrorCallbacks.delete(cb); };
}

export function onReconnectFailed(cb: SimpleCallback): () => void {
  reconnectFailedCallbacks.add(cb);
  return () => { reconnectFailedCallbacks.delete(cb); };
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
  disconnect({ clearSubscriptions: false });

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
    subscriptions.forEach((key) => {
      const scope = parseScopeKey(key);

      if (scope) {
        socket?.emit('Subscribe', {
          scope_id: scope.scopeId,
          scope_type: scope.scopeType,
        });
      }
    });

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

  socket.io.on('reconnect', (attempt: number) => {
    socket?.emit('SyncState', {}, (response: unknown) => {
      const data = response as { state?: unknown } | undefined;
      if (data?.state) {
        stateSyncCallbacks.forEach((cb) => {
          try { cb(data.state); } catch { /* swallow */ }
        });
      }
    });
  });

  socket.io.on('reconnect_attempt', (attempt: number) => {
    reconnectingCallbacks.forEach((cb) => {
      try { cb(attempt); } catch { /* swallow */ }
    });
  });

  socket.io.on('reconnect_error', (error: Error) => {
    reconnectErrorCallbacks.forEach((cb) => {
      try { cb(0); } catch { /* swallow */ }
    });
  });

  socket.io.on('reconnect_failed', () => {
    reconnectFailedCallbacks.forEach((cb) => {
      try { cb(); } catch { /* swallow */ }
    });
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

export function disconnect(options: { clearSubscriptions?: boolean } = {}): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  for (const pending of pendingAcks) {
    clearTimeout(pending.timer);
    pending.reject(new Error('REALTIME_DISCONNECTED'));
  }
  pendingAcks.clear();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  if (options.clearSubscriptions ?? true) {
    subscriptions.clear();
  }
}

export function subscribe(scopeType: RealtimeScopeType, scopeId: string): void {
  subscriptions.add(scopeKey(scopeType, scopeId));
  socket?.emit('Subscribe', { scope_type: scopeType, scope_id: scopeId });
}

export function unsubscribe(scopeType: RealtimeScopeType, scopeId: string): void {
  subscriptions.delete(scopeKey(scopeType, scopeId));
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

type AckEnvelope = {
  data?: unknown;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
  request_id?: string;
  server_time?: string;
};

export function request<T>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  if (!socket || !socket.connected) {
    return Promise.reject(new Error('REALTIME_NOT_CONNECTED'));
  }

  return new Promise<T>((resolve, reject) => {
    const pending: PendingAck = {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer: setTimeout(() => {
        pendingAcks.delete(pending);
        reject(new Error('REALTIME_REQUEST_TIMEOUT'));
      }, timeoutMs),
    };
    pendingAcks.add(pending);

    socket!.emit(event, payload, (response: AckEnvelope) => {
      clearTimeout(pending.timer);
      pendingAcks.delete(pending);

      if (response && response.error) {
        const code = response.error.code ?? 'UNKNOWN_ERROR';
        const message = response.error.message ?? 'Realtime request failed';
        reject(new Error(`[${code}] ${message}`));
        return;
      }

      resolve((response?.data ?? response) as T);
    });
  });
}

function scopeKey(scopeType: RealtimeScopeType, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

function parseScopeKey(key: string): { scopeId: string; scopeType: RealtimeScopeType } | null {
  const separatorIndex = key.indexOf(':');

  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }

  return {
    scopeId: key.slice(separatorIndex + 1),
    scopeType: key.slice(0, separatorIndex) as RealtimeScopeType,
  };
}
