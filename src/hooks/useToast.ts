import { create } from 'zustand';

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  pendingToasts: ToastItem[];
  addToast: (message: string, type: ToastType) => void;
  shiftToast: () => void;
}

let toastId = 0;

export const useToastStore = create<ToastState>((set) => ({
  pendingToasts: [],
  addToast: (message, type) => set((state) => {
    const id = ++toastId;
    return { pendingToasts: [...state.pendingToasts, { id, message, type }] };
  }),
  shiftToast: () => set((state) => ({ pendingToasts: state.pendingToasts.slice(1) }))
}));

export const toast = {
  success: (msg: string) => useToastStore.getState().addToast(msg, "success"),
  error: (msg: string) => useToastStore.getState().addToast(msg, "error"),
  info: (msg: string) => useToastStore.getState().addToast(msg, "info"),
  warning: (msg: string) => useToastStore.getState().addToast(msg, "warning"),
};
