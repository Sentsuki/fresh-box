<script setup lang="ts">
import { useAppStore } from "../stores/appStore";
import type { AppPage } from "../types/app";

const appStore = useAppStore();

function changePage(page: AppPage) {
  void appStore.setCurrentPage(page);
}
</script>

<template>
  <div class="sidebar">
    <div class="logo-container">
      <h1 class="logo">Fresh Box</h1>
      <p class="subtitle">sing-box Client</p>
    </div>
    <div class="nav-items">
      <button
        class="sidebar-item"
        :class="{ active: appStore.currentPage.value === 'overview' }"
        @click="changePage('overview')"
      >
        <span class="sidebar-icon">📊</span>
        Overview
      </button>
      <button
        class="sidebar-item"
        :class="{ active: appStore.currentPage.value === 'config' }"
        @click="changePage('config')"
      >
        <span class="sidebar-icon">📝</span>
        Config
      </button>
      <button
        class="sidebar-item"
        :class="{ active: appStore.currentPage.value === 'settings' }"
        @click="changePage('settings')"
      >
        <span class="sidebar-icon">⚙️</span>
        Settings
      </button>
    </div>
  </div>
</template>
