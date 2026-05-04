<script setup lang="ts">
import { ref } from "vue";
import ConfigOverrideSection from "./settings/ConfigOverrideSection.vue";
import LogSettingsSection from "./settings/LogSettingsSection.vue";
import ProcessManager from "./settings/ProcessManager.vue";
import SingboxCoreSection from "./settings/SingboxCoreSection.vue";
import { useSettings } from "../composables/useSettings";

const settings = useSettings();
const activeTab = ref<"customer" | "setting">("customer");
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Settings</h2>
      <div class="settings-tab-list mt-4">
        <button
          class="settings-tab-button"
          :class="{ active: activeTab === 'customer' }"
          @click="activeTab = 'customer'"
        >
          Customer
        </button>
        <button
          class="settings-tab-button"
          :class="{ active: activeTab === 'setting' }"
          @click="activeTab = 'setting'"
        >
          Setting
        </button>
      </div>
    </div>

    <div class="card-content">
      <template v-if="activeTab === 'customer'">
        <LogSettingsSection
          :is-loading="settings.isLoading.value"
          :enable-transitions="settings.enableTransitions.value"
          :selected-stack-option="settings.selectedStackOption.value"
          :stack-options="settings.stackOptions"
          :has-stack-field="settings.hasStackField.value"
          :log-disabled="settings.logDisabled.value"
          :selected-log-level="settings.selectedLogLevel.value"
          :log-levels="settings.logLevels"
          :has-log-field="settings.hasLogField.value"
          @set-stack-option="settings.setStackOption"
          @update:log-disabled="settings.logDisabled.value = $event"
          @set-log-level="settings.setLogLevel"
          @update-log-configuration="settings.updateLogConfiguration"
        />

        <ConfigOverrideSection
          v-model:enabled="settings.isOverrideEnabled.value"
          v-model:config="settings.overrideConfig.value"
          :is-valid-json="settings.isValidJson.value"
          :json-error="settings.jsonError.value"
          @save="settings.saveOverride"
          @clear="settings.clearOverride"
        />
      </template>

      <template v-else>
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
      </template>
    </div>
  </div>
</template>
