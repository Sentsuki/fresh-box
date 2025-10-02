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
import { ref } from 'vue'

type Toast = {
  id: number
  message: string
  type: 'success' | 'error'
  subtype?: 'save' | 'clear'
}

const toasts = ref([] as Toast[])
let toastId = 0

const showToast = (message: string, type: 'success' | 'error' = 'success', subtype?: 'save' | 'clear') => {
  const id = toastId++
  toasts.value.push({ id, message, type, subtype })
  setTimeout(() => {
    toasts.value = toasts.value.filter(toast => toast.id !== id)
  }, 3000)
}

defineExpose({
  showToast
})
</script>

<style scoped>
.toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 12px 24px;
  border-radius: 4px;
  color: white;
  z-index: 1000;
  animation: slideIn 0.3s ease-out;
}

.toast.success {
  background-color: #4caf50;
}

.toast.success.save {
  background-color: #2196f3;
}

.toast.success.clear {
  background-color: #ff9800;
}

.toast.error {
  background-color: #f44336;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
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