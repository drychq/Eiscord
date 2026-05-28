import { useEffect, useRef } from 'react';
import type { RealtimeEvent } from '@eiscord/shared';
import * as socket from './socket-client';

/**
 * 订阅一个实时事件。组件卸载时自动 unregister。
 *
 * 注意：handler 可以是 inline 函数；内部用 ref 模式保留最新引用，
 * 因此 handler 引用变化不会触发 socket.off/on，只有 event 改变才会重新注册。
 */
export function useRealtimeSubscription(
  event: RealtimeEvent,
  handler: (payload: unknown) => void,
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const wrapped = (raw: unknown) => {
      handlerRef.current(unwrapPayload(raw));
    };
    socket.on(event, wrapped);
    return () => socket.off(event, wrapped);
  }, [event]);
}

function unwrapPayload(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'payload' in payload) {
    return (payload as { payload: unknown }).payload;
  }
  return payload;
}
