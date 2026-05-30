import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * 让「状态驱动的浮层」（保存在 Zustand 里、非路由）支持用浏览器/系统后退键、
 * 后退手势以及 Esc 键关闭，同时不破坏 react-router 的历史簿记。
 *
 * 机制：
 * - 浮层打开时，通过 react-router 的 `navigate` 在当前 URL 上压入一个携带唯一
 *   `overlay` 标记的「哨兵」历史条目（URL 不变，只在 location.state 打标记）。
 * - 用户按后退键时 react-router 弹出哨兵条目，location 不再带标记 → 触发 onClose。
 * - 通过 UI（关闭按钮 / 遮罩 / Esc）关闭时，isOpen 翻 false，若哨兵仍在栈顶则
 *   `navigate(-1)` 把它弹掉，保持前进/后退历史平衡。
 *
 * 仅依赖 react-router 暴露的 `location.state`，不直接读写 `window.history`，因此
 * 在 BrowserRouter / MemoryRouter 下行为一致、可测试。
 */
type DismissPhase = 'idle' | 'pushing' | 'open';

let overlayMarkSeq = 0;

export function useBackDismiss(isOpen: boolean, onClose: () => void): void {
  const navigate = useNavigate();
  const location = useLocation();

  // 用 ref 持有最新的 onClose / location，避免把它们放进 effect 依赖导致反复重订阅。
  const onCloseRef = useRef(onClose);
  const locationRef = useRef(location);
  const phaseRef = useRef<DismissPhase>('idle');
  const markRef = useRef<number | null>(null);

  // 每次渲染后再把最新的 onClose / location 同步到 ref（不在渲染期间写 ref）。
  useEffect(() => {
    onCloseRef.current = onClose;
    locationRef.current = location;
  });

  // 打开 → 压入哨兵；关闭 → 弹出哨兵。
  useEffect(() => {
    if (isOpen && phaseRef.current === 'idle') {
      const mark = ++overlayMarkSeq;
      markRef.current = mark;
      phaseRef.current = 'pushing';
      const loc = locationRef.current;
      navigate(loc.pathname + loc.search + loc.hash, {
        state: { ...(loc.state as Record<string, unknown> | null), overlay: mark },
      });
    } else if (!isOpen && phaseRef.current !== 'idle') {
      const wasOpen = phaseRef.current === 'open';
      const sentinelOnTop =
        (locationRef.current.state as { overlay?: number } | null)?.overlay === markRef.current;
      phaseRef.current = 'idle';
      markRef.current = null;
      // 仅当哨兵还在栈顶（即不是因为前进导航而关闭）才回退一格平衡历史。
      if (wasOpen && sentinelOnTop) navigate(-1);
    }
  }, [isOpen, navigate]);

  // 观察 location 变化：先确认哨兵已生效，再据此识别「后退键弹出哨兵」。
  useEffect(() => {
    const mark = (location.state as { overlay?: number } | null)?.overlay;
    if (phaseRef.current === 'pushing' && mark === markRef.current) {
      phaseRef.current = 'open';
    } else if (phaseRef.current === 'open' && mark !== markRef.current) {
      phaseRef.current = 'idle';
      markRef.current = null;
      onCloseRef.current();
    }
  }, [location]);

  // Esc 键关闭（桌面端补充）。
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);
}
