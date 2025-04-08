<script setup lang="ts">
defineProps<{
  currentPage: 'overview' | 'config';
}>();

const emit = defineEmits<{
  'update:currentPage': ['overview' | 'config'];
}>();

function changePage(page: 'overview' | 'config') {
  emit('update:currentPage', page);
}
</script>

<template>
  <div class="sidebar">
    <div class="logo-container">
      <h1 class="logo">Fresh Box</h1>
      <p class="subtitle">Sing-box Client</p>
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
    </div>
  </div>
</template>