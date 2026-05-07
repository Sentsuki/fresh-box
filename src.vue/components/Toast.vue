<script setup lang="ts">
import { computed } from "vue";
import { useToastState } from "../composables/useToast";

const { toasts } = useToastState();

const toastClassMap = computed(() =>
  Object.fromEntries(
    toasts.value.map((toast) => {
      if (toast.type === "success") {
        if (toast.accent === "save") {
          return [toast.id, "bg-blue-500"];
        }

        if (toast.accent === "clear") {
          return [toast.id, "bg-orange-500"];
        }

        return [toast.id, "bg-green-500"];
      }

      if (toast.type === "info") {
        return [toast.id, "bg-slate-500"];
      }

      return [toast.id, "bg-red-500"];
    }),
  ),
);
</script>

<template>
  <TransitionGroup name="toast">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="fixed bottom-5 right-5 z-50 rounded px-6 py-3 text-white shadow-lg"
      :class="toastClassMap[toast.id]"
      :style="{ animation: 'slideIn 0.3s ease-out' }"
    >
      {{ toast.message }}
    </div>
  </TransitionGroup>
</template>
