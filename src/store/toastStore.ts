import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'error';

type ToastState = {
  visible: boolean;
  message: string;
  tone: ToastTone;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  message: '',
  tone: 'success',
  show: (message, tone = 'success') => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ visible: true, message, tone });
    hideTimer = setTimeout(() => set({ visible: false }), 2600);
  },
  hide: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ visible: false });
  },
}));

export function showToast(message: string, tone: ToastTone = 'success') {
  useToastStore.getState().show(message, tone);
}
