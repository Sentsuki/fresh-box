<template>
  <div class="settings-container">
    <div class="content-card">
      <div class="card-header">
        <h2>Settings</h2>
      </div>
      
      <div class="card-content">
        <div class="settings-section">
          <h3>Configuration</h3>
          <div class="setting-item">
            <label>Enable Config Override</label>
            <input type="checkbox" v-model="isOverrideEnabled" class="checkbox" />
          </div>
          
          <div v-if="isOverrideEnabled" class="override-section">
            <div class="config-editor">
              <textarea 
                v-model="overrideConfig" 
                placeholder="Enter your configuration override here (JSON format)"
                rows="10"
                class="config-textarea"
              ></textarea>
            </div>
            <div class="button-group">
              <button 
                @click="saveOverride" 
                :disabled="!isValidJson"
                class="control-button save-button"
              >
                Save Override
              </button>
              <button 
                @click="clearOverride"
                class="control-button clear-button"
              >
                Clear Override
              </button>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h3>Application</h3>
          <div class="setting-item">
            <button @click="openAppDirectory" class="control-button">
              Open App Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useConfigOverride } from '../services/configOverride'
import { invoke } from '@tauri-apps/api/core'

const { isEnabled, config, enableOverride, disableOverride, saveConfig, clearConfig } = useConfigOverride()

const isOverrideEnabled = computed({
  get: () => isEnabled.value,
  set: (value) => value ? enableOverride() : disableOverride()
})

const overrideConfig = computed({
  get: () => JSON.stringify(config.value, null, 2),
  set: (value) => {
    try {
      config.value = JSON.parse(value)
    } catch (e) {
      // Invalid JSON, keep the current value
    }
  }
})

const isValidJson = computed(() => {
  try {
    JSON.parse(overrideConfig.value)
    return true
  } catch (e) {
    return false
  }
})

const saveOverride = () => {
  if (isValidJson.value) {
    saveConfig(JSON.parse(overrideConfig.value))
  }
}

const clearOverride = () => {
  clearConfig()
}

const openAppDirectory = async () => {
  try {
    await invoke('open_app_directory')
  } catch (error) {
    console.error('Failed to open app directory:', error)
  }
}
</script>