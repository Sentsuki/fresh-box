import { computed, readonly, ref } from "vue";

type ToastType = "success" | "error" | "info";
type ToastAccent = "save" | "clear";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  accent?: ToastAccent;
}

const toasts = ref<ToastItem[]>([]);
let toastId = 0;

function show(
  message: string,
  type: ToastType = "success",
  accent?: ToastAccent,
) {
  toasts.value = [];

  const id = toastId++;
  toasts.value.push({ id, message, type, accent });

  window.setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }, 3000);
}

export const toast = {
  show,
  success(message: string, accent?: ToastAccent) {
    show(message, "success", accent);
  },
  error(message: string) {
    show(message, "error");
  },
  info(message: string) {
    show(message, "info");
  },
};

export function useToastState() {
  return {
    toasts: readonly(toasts),
    hasToasts: computed(() => toasts.value.length > 0),
  };
}
