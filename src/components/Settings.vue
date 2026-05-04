<script setup lang="ts">
import ProcessManager from "./settings/ProcessManager.vue";
import SingboxCoreSection from "./settings/SingboxCoreSection.vue";
import { useSettings } from "../composables/useSettings";

const settings = useSettings();
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Settings</h2>
    </div>

    <div class="card-content">
      <SingboxCoreSection
        :core-status="settings.coreStatus.value"
        :core-status-error="settings.coreStatusError.value"
        :core-status-text="settings.coreStatusText.value"
        :core-status-badge-class="settings.coreStatusBadgeClass.value"
        :is-refreshing-core-status="settings.isRefreshingCoreStatus.value"
        :is-updating-core="settings.isUpdatingCore.value"
        :update-core-button-label="settings.updateCoreButtonLabel.value"
        @refresh="settings.refreshCoreStatus(true)"
        @update="settings.installCoreUpdate"
      />

      <div class="settings-section">
        <h3>Open Directory</h3>
        <div class="setting-item border-b-0!">
          <button
            class="control-button flex items-center gap-2 bg-gray-500 text-white hover:bg-gray-600"
            @click="settings.openApplicationDirectory"
          >
            <span class="text-base">📁</span>
            Open App Directory
          </button>
        </div>
      </div>

      <ProcessManager
        :is-refreshing="settings.isRefreshing.value"
        :is-getting-status="settings.isGettingStatus.value"
        :process-status="settings.processStatus.value"
        :process-status-class="settings.processStatusClass.value"
        @refresh="settings.detectManagedProcess"
        @get-status="settings.loadManagedProcessStatus"
      />
    </div>
  </div>
</template>
