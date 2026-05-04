<script setup lang="ts">
import ConfigOverrideSection from "./settings/ConfigOverrideSection.vue";
import LogSettingsSection from "./settings/LogSettingsSection.vue";
import { useSettings } from "../composables/useSettings";

const settings = useSettings();
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Customer</h2>
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
    </div>
  </div>
</template>
