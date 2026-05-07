<script setup lang="ts">
import SubscriptionList from "./config/SubscriptionList.vue";
import ConfigFileGrid from "./config/ConfigFileGrid.vue";
</script>

<template>
  <div class="content-card">
    <div class="card-header">
      <h2>Configuration Files</h2>
    </div>

    <div class="card-content flex flex-col min-h-0">
      <div class="config-container">
        <SubscriptionList />
        <ConfigFileGrid />
      </div>
    </div>
  </div>
</template>
