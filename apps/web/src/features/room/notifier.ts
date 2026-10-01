import { toast } from 'sonner';

/** Where room events become user-visible toasts (a port, so event binding is testable). */
export interface Notifier {
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export const toastNotifier: Notifier = {
  info: (message) => toast(message),
  success: (message) => toast.success(message),
  warning: (message) => toast.warning(message),
  error: (message) => toast.error(message),
};
