<template>
  <div class="proxy-page">
    <h2>节点状态</h2>
    <div v-if="isRunning" class="proxy-list">
      <div v-for="proxy in proxies" :key="proxy.name" class="proxy-item">
        <div class="proxy-info">
          <h3>{{ proxy.name }}</h3>
          <p>类型: {{ proxy.type }}</p>
          <p>延迟: {{ proxy.delay }}ms</p>
          <p>状态: {{ proxy.status }}</p>
        </div>
        <div class="proxy-actions">
          <button @click="selectProxy(proxy.name)" :disabled="proxy.name === currentProxy">
            选择
          </button>
        </div>
      </div>
    </div>
    <div v-else class="proxy-placeholder">
      <p>请先启动 sing-box 服务</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'

interface Proxy {
  name: string
  type: string
  delay: number
  status: string
}

const proxies = ref<Proxy[]>([])
const currentProxy = ref<string>('')
const isRunning = ref(false)
let intervalId: number | null = null

const fetchProxies = async () => {
  try {
    const response = await invoke('get_proxies')
    proxies.value = response as Proxy[]
  } catch (error) {
    console.error('Failed to fetch proxies:', error)
  }
}

const selectProxy = async (name: string) => {
  try {
    await invoke('select_proxy', { name })
    currentProxy.value = name
    await fetchProxies()
  } catch (error) {
    console.error('Failed to select proxy:', error)
  }
}

// 监听 isRunning 状态变化
watch(isRunning, (newValue) => {
  if (newValue) {
    // 启动时立即获取一次
    fetchProxies()
    // 设置定时刷新
    intervalId = window.setInterval(fetchProxies, 5000)
  } else {
    // 停止时清除定时器
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
    // 清空代理列表
    proxies.value = []
    currentProxy.value = ''
  }
})

onMounted(() => {
  // 检查服务是否已运行
  invoke<boolean>('is_singbox_running')
    .then(running => {
      isRunning.value = running
      if (running) {
        fetchProxies()
        intervalId = window.setInterval(fetchProxies, 5000)
      }
    })
    .catch(err => {
      console.error('Failed to check service status:', err)
    })
})

// 组件卸载时清除定时器
onUnmounted(() => {
  if (intervalId !== null) {
    window.clearInterval(intervalId)
  }
})
</script>

<style scoped>
.proxy-page {
  padding: 20px;
}

.proxy-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.proxy-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.proxy-info h3 {
  margin: 0 0 10px 0;
}

.proxy-info p {
  margin: 5px 0;
}

.proxy-actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background-color: #4CAF50;
  color: white;
  cursor: pointer;
}

.proxy-actions button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.proxy-placeholder {
  text-align: center;
  margin-top: 40px;
  color: #666;
}
</style> 