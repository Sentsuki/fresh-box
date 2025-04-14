<script setup lang="ts">
defineProps<{
  currentPage: 'overview' | 'config' | 'settings';
}>();

const emit = defineEmits<{
  'update:currentPage': ['overview' | 'config' | 'settings'];
}>();

function changePage(page: 'overview' | 'config' | 'settings') {
  emit('update:currentPage', page);
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
        <span class="sidebar-icon">📝</span>
        Config
      </div>
      <div 
        class="sidebar-item" 
        :class="{ 'active': currentPage === 'settings' }" 
        @click="changePage('settings')"
      >
        <span class="sidebar-icon">⚙️</span>
        Settings
      </div>
    </div>
  </div>
</template>