<script setup lang="ts">
import { computed } from "vue";
import { useSingbox } from "../composables/useSingbox";
import { useAppStore } from "../stores/appStore";

const appStore = useAppStore();
const singbox = useSingbox();

const isSubscription = computed(() => {
  const displayName = appStore.selectedConfigDisplay.value;
  return !!(displayName && appStore.subscriptions.value[displayName]);
});
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Overview</h2>
    </div>
    <div class="card-content">
      <div
        class="overview-status-card"
        :class="{ running: appStore.isRunning.value }"
      >
        <div class="status-header">
          <div class="status-icon-wrapper">
            <div
              class="status-icon"
              :class="{ active: appStore.isRunning.value }"
            >
              <svg
                v-if="appStore.isRunning.value"
                class="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clip-rule="evenodd"
                />
              </svg>
              <svg
                v-else
                class="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
          </div>
          <div class="status-content">
            <h3 class="status-title">
              {{
                appStore.isRunning.value ? "Service Running" : "Service Stopped"
              }}
            </h3>
            <p class="status-subtitle">
              {{
                appStore.isRunning.value
                  ? "Sing-box is active and ready"
                  : "Click start to begin"
              }}
            </p>
          </div>
          <div
            class="status-badge"
            :class="{
              active: appStore.isRunning.value,
              clickable: appStore.isRunning.value,
            }"
            @click="appStore.isRunning.value ? singbox.openPanel() : null"
          >
            {{ appStore.isRunning.value ? "PANEL" : "INACTIVE" }}
          </div>
        </div>

        <div
          v-if="appStore.selectedConfigDisplay.value"
          class="status-config-info"
        >
          <div class="config-info-left">
            <svg
              v-if="isSubscription"
              class="config-info-icon subscription"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
              />
            </svg>
            <svg
              v-else
              class="config-info-icon"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fill-rule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="config-info-text">
              {{ appStore.selectedConfigDisplay.value }}
            </span>
          </div>
          <span
            class="config-info-label"
            :class="{ subscription: isSubscription }"
          >
            {{ isSubscription ? "Subscription" : "Local" }}
          </span>
        </div>
      </div>

      <div class="overview-actions">
        <button
          class="overview-btn start-btn"
          :disabled="
            appStore.isRunning.value ||
            appStore.isLoading.value ||
            !appStore.selectedConfigPath.value
          "
          @click="singbox.startService"
        >
          <svg class="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
              clip-rule="evenodd"
            />
          </svg>
          {{
            appStore.isLoading.value && !appStore.isRunning.value
              ? "Starting..."
              : "Start"
          }}
        </button>
        <button
          class="overview-btn stop-btn"
          :disabled="!appStore.isRunning.value || appStore.isLoading.value"
          @click="singbox.stopService"
        >
          <svg class="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
              clip-rule="evenodd"
            />
          </svg>
          {{
            appStore.isLoading.value && appStore.isRunning.value
              ? "Stopping..."
              : "Stop"
          }}
        </button>
      </div>
    </div>
  </div>
</template>
