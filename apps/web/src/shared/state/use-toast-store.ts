import { create } from 'zustand';

export type ToastKind = 'info' | 'error' | 'success';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  ttl: number;
};

export type ToastState = {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
};

let nextToastId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  pushToast: (toast) => {
    const id = `toast-${nextToastId++}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    if (toast.ttl > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, toast.ttl);
    }
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
