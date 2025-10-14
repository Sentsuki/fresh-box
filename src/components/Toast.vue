<template>
  <TransitionGroup name="toast">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="fixed bottom-5 right-5 px-6 py-3 rounded text-white z-50"
      :class="getToastClass(toast)"
      :style="{ animation: 'slideIn 0.3s ease-out' }"
    >
      {{ toast.message }}
    </div>
  </TransitionGroup>
</template>

<script setup lang="ts">
import { ref } from "vue";

type Toast = {
  id: number;
  message: string;
  type: "success" | "error";
  subtype?: "save" | "clear";
};

const toasts = ref([] as Toast[]);
let toastId = 0;

const showToast = (
  message: string,
  type: "success" | "error" = "success",
  subtype?: "save" | "clear",
) => {
  const id = toastId++;
  toasts.value.push({ id, message, type, subtype });
  setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }, 3000);
};

const getToastClass = (toast: Toast) => {
  if (toast.type === 'success') {
    if (toast.subtype === 'save') {
      return 'bg-blue-500';
    } else if (toast.subtype === 'clear') {
      return 'bg-orange-500';
    } else {
      return 'bg-green-500';
    }
  } else if (toast.type === 'error') {
    return 'bg-red-500';
  }
  return 'bg-green-500';
};

defineExpose({
  showToast,
});
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  @apply transition-all duration-300 ease-in-out;
}

.toast-enter-from,
.toast-leave-to {
  @apply opacity-0 translate-x-full;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
