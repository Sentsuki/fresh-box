<script setup lang="ts">
import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

// 组件属性
const props = defineProps({
  isVisible: {
    type: Boolean,
    required: true,
  },
  configFileName: {
    type: String,
    default: "",
  },
});

// 事件定义
const emit = defineEmits(["close"]);

// 响应式状态
const configContent = ref("");
const isLoading = ref(false);
const error = ref("");

// 监听配置文件名变化，自动加载内容
watch(
  () => props.configFileName,
  async (newFileName) => {
    if (newFileName && props.isVisible) {
      await loadConfigContent(newFileName);
    }
  },
  { immediate: true }
);

// 监听弹窗显示状态
watch(
  () => props.isVisible,
  async (isVisible) => {
    if (isVisible && props.configFileName) {
      await loadConfigContent(props.configFileName);
    } else if (!isVisible) {
      // 清空内容
      configContent.value = "";
      error.value = "";
    }
  }
);

// 加载配置文件内容
async function loadConfigContent(fileName: string) {
  if (!fileName) return;

  isLoading.value = true;
  error.value = "";
  
  try {
    const content = await invoke<string>("read_config_content", {
      configPath: `${fileName}.json`,
    });
    
    // 格式化JSON内容
    try {
      const parsed = JSON.parse(content);
      configContent.value = JSON.stringify(parsed, null, 2);
    } catch {
      // 如果不是有效的JSON，直接显示原始内容
      configContent.value = content;
    }
  } catch (err) {
    error.value = `Failed to load config: ${err}`;
    configContent.value = "";
  } finally {
    isLoading.value = false;
  }
}

// 关闭弹窗
function closeViewer() {
  emit("close");
}

// 复制内容到剪贴板
async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(configContent.value);
    // 这里可以添加一个简单的提示
    alert("Content copied to clipboard!");
  } catch (err) {
    console.error("Failed to copy to clipboard:", err);
  }
}
</script>

<template>
  <!-- 弹窗遮罩 -->
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="closeViewer"
  >
    <!-- 弹窗内容 -->
    <div
      class="bg-white rounded-lg shadow-xl max-w-4xl max-h-[80vh] w-full mx-4 flex flex-col"
      @click.stop
    >
      <!-- 弹窗头部 -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 class="text-lg font-semibold text-gray-800">
          Configuration: {{ configFileName }}
        </h3>
        <div class="flex gap-2">
          <button
            v-if="configContent && !isLoading"
            class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            @click="copyToClipboard"
          >
            Copy
          </button>
          <button
            class="text-gray-500 hover:text-gray-700 text-xl leading-none"
            @click="closeViewer"
          >
            ×
          </button>
        </div>
      </div>

      <!-- 弹窗内容区域 -->
      <div class="flex-1 overflow-hidden">
        <!-- 加载状态 -->
        <div
          v-if="isLoading"
          class="flex items-center justify-center h-64 text-gray-500"
        >
          <div class="text-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            Loading configuration...
          </div>
        </div>

        <!-- 错误状态 -->
        <div
          v-else-if="error"
          class="flex items-center justify-center h-64 text-red-500"
        >
          <div class="text-center">
            <div class="text-4xl mb-2">⚠️</div>
            {{ error }}
          </div>
        </div>

        <!-- 配置内容 -->
        <div v-else-if="configContent" class="h-full overflow-auto">
          <pre class="p-4 text-sm font-mono bg-gray-50 h-full overflow-auto whitespace-pre-wrap break-words">{{ configContent }}</pre>
        </div>

        <!-- 空状态 -->
        <div
          v-else
          class="flex items-center justify-center h-64 text-gray-500"
        >
          No content to display
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 确保代码块的滚动条样式 */
pre {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e0 #f7fafc;
}

pre::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

pre::-webkit-scrollbar-track {
  background: #f7fafc;
}

pre::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 4px;
}

pre::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}
</style>