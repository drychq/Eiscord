import { create } from 'zustand';

export type ToastKind = 'info' | 'error' | 'success' | 'warning';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  ttl: number;
};

export const TOAST_DURATION = {
  short: 2500,
  default: 5000,
  long: 10000,
} as const;

export type ToastState = {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
};

let nextToastId = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  pushToast: (toast) => {
    const id = `toast-${nextToastId++}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    if (toast.ttl > 0) {
      const timer = setTimeout(() => {
        timers.delete(id);
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, toast.ttl);
      timers.set(id, timer);
    }
    return id;
  },

  dismissToast: (id) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
