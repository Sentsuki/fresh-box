<script setup lang="ts">
import ConfigOverrideSection from "./settings/ConfigOverrideSection.vue";
import LogSettingsSection from "./settings/LogSettingsSection.vue";
import ProcessManager from "./settings/ProcessManager.vue";
import { useSettings } from "../composables/useSettings";

const settings = useSettings();
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Settings</h2>
    </div>

    <div class="card-content">
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

      <div class="settings-section">
        <h3>Application</h3>
        <div class="flex flex-col gap-4">
          <div class="setting-item">
            <button
              class="control-button flex items-center gap-2 bg-gray-500 text-white hover:bg-gray-600"
              @click="settings.openApplicationDirectory"
            >
              <span class="text-base">📁</span>
              Open App Directory
            </button>
          </div>

          <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3"
            >
              <div>
                <p class="m-0 text-sm font-semibold text-gray-800">Sing-box Core</p>
                <p class="m-0 mt-1 text-xs text-gray-500">
                  Syncs with the latest SagerNet/sing-box Windows amd64 release.
                </p>
              </div>
              <span
                class="rounded-full px-3 py-1 text-xs font-semibold"
                :class="settings.coreStatusBadgeClass.value"
              >
                {{ settings.coreStatusText.value }}
              </span>
            </div>

            <div class="flex flex-col gap-4 p-4">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p class="m-0 text-xs uppercase tracking-wide text-gray-500">
                    Current Version
                  </p>
                  <p class="m-0 mt-2 text-sm font-semibold text-gray-800">
                    {{ settings.coreStatus.value?.current_version || "Not installed" }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p class="m-0 text-xs uppercase tracking-wide text-gray-500">
                    Latest Version
                  </p>
                  <p class="m-0 mt-2 text-sm font-semibold text-gray-800">
                    {{ settings.coreStatus.value?.latest_version || "Unknown" }}
                  </p>
                </div>
              </div>

              <div
                v-if="settings.coreStatus.value?.is_running"
                class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                The latest core can still be downloaded now, but you need to stop
                sing-box before it can be unpacked and applied.
              </div>

              <div
                v-if="settings.coreStatusError.value"
                class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {{ settings.coreStatusError.value }}
              </div>

              <div class="flex flex-wrap gap-3">
                <button
                  class="control-button min-w-40 flex-1 rounded-lg border-0 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200"
                  :class="
                    settings.isRefreshingCoreStatus.value
                      ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none'
                      : 'bg-slate-500 hover:bg-slate-600 hover:shadow-sm config-button-hover'
                  "
                  :disabled="
                    settings.isRefreshingCoreStatus.value ||
                    settings.isUpdatingCore.value
                  "
                  @click="settings.refreshCoreStatus(true)"
                >
                  <span
                    v-if="settings.isRefreshingCoreStatus.value"
                    class="flex h-5 w-5 items-center justify-center text-base animate-spin"
                    >🔄</span
                  >
                  <span
                    v-else
                    class="flex h-5 w-5 items-center justify-center text-base"
                    >🧭</span
                  >
                  <span class="font-medium">
                    {{
                      settings.isRefreshingCoreStatus.value
                        ? "Checking..."
                        : "Check Latest"
                    }}
                  </span>
                </button>

                <button
                  class="control-button min-w-40 flex-1 rounded-lg border-0 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200"
                  :class="
                    settings.isUpdatingCore.value
                      ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none'
                      : 'bg-violet-600 hover:bg-violet-700 hover:shadow-sm config-button-hover'
                  "
                  :disabled="
                    settings.isUpdatingCore.value ||
                    settings.isRefreshingCoreStatus.value ||
                    !settings.coreStatus.value?.latest_version
                  "
                  @click="settings.installCoreUpdate"
                >
                  <span
                    v-if="settings.isUpdatingCore.value"
                    class="flex h-5 w-5 items-center justify-center text-base animate-spin"
                    >⬇️</span
                  >
                  <span
                    v-else
                    class="flex h-5 w-5 items-center justify-center text-base"
                    >⚙️</span
                  >
                  <span class="font-medium">
                    {{ settings.updateCoreButtonLabel.value }}
                  </span>
                </button>
              </div>
            </div>
          </div>
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
