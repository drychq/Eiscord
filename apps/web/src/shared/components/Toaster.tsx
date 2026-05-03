import { useToastStore } from '../state/use-toast-store';

export function Toaster() {
  const { toasts, dismissToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toaster" aria-live="polite" role="status">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.kind}`} key={toast.id} role="alert">
          <span>{toast.message}</span>
          <button
            className="toast-dismiss"
            type="button"
            aria-label="关闭"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
