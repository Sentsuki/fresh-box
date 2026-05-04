<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppStore } from "../../stores/appStore";
import { useConfigs } from "../../composables/useConfigs";

const appStore = useAppStore();
const configs = useConfigs();
const subscriptionUrl = ref("");

const canAddSubscription = computed(
  () => !!subscriptionUrl.value.trim() && !appStore.isLoading.value,
);

function submitSubscription() {
  if (!canAddSubscription.value) {
    return;
  }

  void configs.addSubscription(subscriptionUrl.value.trim());
  subscriptionUrl.value = "";
}
</script>

<template>
  <div class="flex w-full max-w-4xl flex-col gap-3">
    <div class="flex flex-col gap-3 md:flex-row">
      <input
        v-model="subscriptionUrl"
        type="text"
        class="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        placeholder="Enter subscription URL"
        :disabled="appStore.isLoading.value"
        @keyup.enter="submitSubscription"
      />
      <button
        class="control-button subscribe-button"
        :disabled="!canAddSubscription"
        :class="{ disabled: !canAddSubscription }"
        @click="submitSubscription"
      >
        <span class="mr-3 text-lg">📥</span>
        {{ appStore.isLoading.value ? "Subscribing..." : "Subscribe" }}
      </button>
    </div>
    <div class="flex w-full">
      <button
        class="control-button select-button w-full justify-center"
        :disabled="appStore.isLoading.value"
        :class="{ disabled: appStore.isLoading.value }"
        @click="configs.selectConfigFile"
      >
        <span class="mr-3 text-lg">📁</span>
        Add Config
      </button>
    </div>
  </div>
</template>
