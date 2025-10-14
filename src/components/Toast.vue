<template>
  <TransitionGroup name="toast">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="[toast.type, toast.subtype]"
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

defineExpose({
  showToast,
});
</script>

<style scoped>
.toast {
  @apply fixed bottom-5 right-5 px-6 py-3 rounded text-white z-50;
  animation: slideIn 0.3s ease-out;
}

.toast.success {
  @apply bg-green-500;
}

.toast.success.save {
  @apply bg-blue-500;
}

.toast.success.clear {
  @apply bg-orange-500;
}

.toast.error {
  @apply bg-red-500;
}

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
