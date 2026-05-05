<script setup lang="ts">
import ProcessManager from "./settings/ProcessManager.vue";
import SingboxCoreSection from "./settings/SingboxCoreSection.vue";
import { useSettings } from "../composables/useSettings";

const settings = useSettings({
  loadCustomerSettings: false,
  autoRefreshCoreStatus: true,
});
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
        :core-update-progress="settings.coreUpdateProgress.value"
        :current-core-label="settings.currentCoreLabel.value"
        :selected-core-label="settings.selectedCoreLabel.value"
        :selected-core-option-key="settings.selectedCoreOptionKey.value"
        :available-options="settings.coreStatus.value?.available_options ?? []"
        :core-status-text="settings.coreStatusText.value"
        :core-status-badge-class="settings.coreStatusBadgeClass.value"
        :is-refreshing-core-status="settings.isRefreshingCoreStatus.value"
        :is-updating-core="settings.isUpdatingCore.value"
        :update-core-button-label="settings.updateCoreButtonLabel.value"
        @refresh="settings.refreshCoreStatus(true, true)"
        @apply="settings.applySelectedCore"
        @update:selected-core-option-key="
          settings.selectedCoreOptionKey.value = $event
        "
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
        :is-refreshing-status="settings.isRefreshingStatus.value"
        :process-status="settings.processStatus.value"
        :process-status-class="settings.processStatusClass.value"
        @refresh="settings.refreshManagedProcessStatus"
      />
    </div>
  </div>
</template>
