<template>
  <div class="content-card">
    <Toast ref="toastRef" />
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
              :class="{ 'error': !isValidJson }"
            ></textarea>
            <div v-if="!isValidJson" class="error-message">
              {{ jsonError }}
            </div>
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
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useConfigOverride } from '../services/configOverride'
import { invoke } from '@tauri-apps/api/core'
import Toast from './Toast.vue'

interface ConfigOverride {
  [key: string]: any
}

const toastRef = ref<InstanceType<typeof Toast> | null>(null)
const jsonError = ref<string>('')
const rawConfig = ref<string>('')

const { isEnabled, config, enableOverride, disableOverride, saveConfig, clearConfig } = useConfigOverride()

// 加载已有配置
onMounted(async () => {
  try {
    const loadedConfig = await invoke<ConfigOverride>('load_config_override')
    if (Object.keys(loadedConfig).length > 0) {
      rawConfig.value = JSON.stringify(loadedConfig, null, 2)
      config.value = loadedConfig
    }
  } catch (error) {
    console.error('Failed to load config override:', error)
  }
})

const isOverrideEnabled = computed({
  get: () => isEnabled.value,
  set: (value) => value ? enableOverride() : disableOverride()
})

const overrideConfig = computed({
  get: () => rawConfig.value,
  set: (value) => {
    rawConfig.value = value
    try {
      const parsed = JSON.parse(value)
      config.value = parsed
      jsonError.value = ''
    } catch (e) {
      if (e instanceof SyntaxError) {
        jsonError.value = e.message
      } else {
        jsonError.value = 'Invalid JSON format'
      }
    }
  }
})

const isValidJson = computed(() => {
  return jsonError.value === ''
})

const saveOverride = async () => {
  if (!isValidJson.value) {
    toastRef.value?.showToast('Please fix JSON format errors before saving', 'error')
    return
  }

  try {
    await saveConfig(JSON.parse(overrideConfig.value))
    toastRef.value?.showToast('Configuration override saved successfully', 'success', 'save')
  } catch (error) {
    console.error('Failed to save config override:', error)
    toastRef.value?.showToast('Failed to save configuration override', 'error')
  }
}

const clearOverride = async () => {
  try {
    await clearConfig()
    // 清除 temp_config.json
    try {
      await invoke('delete_config', { configPath: 'temp_config.json' })
    } catch (error) {
      console.error('Failed to delete temp config:', error)
    }
    rawConfig.value = '{}'
    jsonError.value = ''
    toastRef.value?.showToast('Configuration override cleared successfully', 'success', 'clear')
  } catch (error) {
    console.error('Failed to clear config override:', error)
    toastRef.value?.showToast('Failed to clear configuration override', 'error')
  }
}

const openAppDirectory = async () => {
  try {
    await invoke('open_app_directory')
  } catch (error) {
    console.error('Failed to open app directory:', error)
    toastRef.value?.showToast('Failed to open app directory', 'error')
  }
}
</script>

<style scoped>
.config-textarea.error {
  border-color: #f44336;
  background-color: #fff5f5;
}

.error-message {
  color: #d32f2f;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 500;
  padding: 8px 12px;
  background-color: #ffebee;
  border-radius: 4px;
  border-left: 4px solid #f44336;
}
</style>