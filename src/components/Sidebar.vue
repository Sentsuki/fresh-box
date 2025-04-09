<script setup lang="ts">
defineProps<{
  currentPage: 'overview' | 'config' | 'proxy';
}>();

const emit = defineEmits<{
  'navigate': ['overview' | 'config' | 'proxy'];
}>();

function changePage(page: 'overview' | 'config' | 'proxy') {
  emit('navigate', page);
}
</script>

<template>
  <div class="sidebar">
    <div class="logo-container">
      <h1 class="logo">Fresh Box</h1>
      <p class="subtitle">sing-box Client</p>
    </div>
    <div class="nav-items">
      <div 
        class="sidebar-item" 
        :class="{ 'active': currentPage === 'overview' }" 
        @click="changePage('overview')"
      >
        <span class="sidebar-icon">📊</span>
        Overview
      </div>
      <div 
        class="sidebar-item" 
        :class="{ 'active': currentPage === 'config' }" 
        @click="changePage('config')"
      >
        <span class="sidebar-icon">⚙️</span>
        Config
      </div>
      <div 
        class="sidebar-item" 
        :class="{ 'active': currentPage === 'proxy' }" 
        @click="changePage('proxy')"
      >
        <span class="sidebar-icon">🌐</span>
        Proxy
      </div>
    </div>
  </div>
</template>