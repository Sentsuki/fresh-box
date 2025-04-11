<template>
  <div class="settings-container">
    <h2>Settings</h2>
    
    <div class="settings-section">
      <div class="setting-item">
        <label>Enable Config Override</label>
        <input type="checkbox" v-model="isOverrideEnabled" />
      </div>
      
      <div v-if="isOverrideEnabled" class="override-section">
        <h3>Configuration Override</h3>
        <div class="config-editor">
          <textarea 
            v-model="overrideConfig" 
            placeholder="Enter your configuration override here (JSON format)"
            rows="10"
          ></textarea>
        </div>
        <div class="button-group">
          <button @click="saveOverride" :disabled="!isValidJson">Save Override</button>
          <button @click="clearOverride">Clear Override</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigOverride } from '../services/configOverride'

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
</script>

<style scoped>
.settings-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.settings-section {
  margin-top: 20px;
}

.setting-item {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.setting-item label {
  margin-right: 10px;
}

.override-section {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.config-editor {
  margin: 15px 0;
}

.config-editor textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
}

.button-group {
  display: flex;
  gap: 10px;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background-color: #4CAF50;
  color: white;
  cursor: pointer;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

button:last-child {
  background-color: #f44336;
}
</style> 