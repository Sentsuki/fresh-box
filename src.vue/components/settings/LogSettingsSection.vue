<script setup lang="ts">
import type { LogLevel, StackOption } from "../../types/app";

defineProps<{
  isLoading: boolean;
  enableTransitions: boolean;
  selectedStackOption: StackOption;
  stackOptions: StackOption[];
  hasStackField: boolean;
  logDisabled: boolean;
  selectedLogLevel: LogLevel;
  logLevels: LogLevel[];
  hasLogField: boolean;
}>();

defineEmits<{
  "set-stack-option": [option: StackOption];
  "update:log-disabled": [value: boolean];
  "set-log-level": [value: LogLevel];
  "update-log-configuration": [];
}>();
</script>

<template>
  <div class="settings-section">
    <h3>Configuration</h3>

    <div v-if="hasStackField || isLoading" class="setting-item-vertical">
      <span class="mb-3 block text-base font-medium text-gray-700">Stack</span>
      <div v-if="isLoading" class="segmented-control stack-segmented-control">
        <div class="segmented-control-track">
          <div class="h-9 animate-pulse rounded-md bg-gray-300" />
        </div>
      </div>
      <div v-else class="segmented-control stack-segmented-control">
        <div class="segmented-control-track">
          <div
            class="segmented-control-indicator"
            :class="{ 'no-transition': !enableTransitions }"
            :style="{
              left: `calc(3px + ${stackOptions.indexOf(selectedStackOption)} * (100% - 6px) / ${stackOptions.length})`,
              width: `calc((100% - 6px) / ${stackOptions.length})`,
            }"
          />
          <button
            v-for="option in stackOptions"
            :key="option"
            class="segmented-control-option"
            :class="{ active: selectedStackOption === option }"
            @click="$emit('set-stack-option', option)"
          >
            {{ option.charAt(0).toUpperCase() + option.slice(1) }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="hasLogField || isLoading" class="setting-item-vertical">
      <span class="text-base font-medium text-gray-700">Log</span>

      <div v-if="isLoading" class="mt-3">
        <div class="log-toggle-row">
          <span class="text-sm font-medium text-gray-600">Disable Logging</span>
          <div class="h-5 w-9 animate-pulse rounded-full bg-gray-300" />
        </div>
        <div class="log-level-section">
          <span class="mb-3 block text-sm font-medium text-gray-600"
            >Level</span
          >
          <div class="segmented-control log-segmented-control">
            <div class="segmented-control-track">
              <div class="h-8 animate-pulse rounded-md bg-gray-300" />
            </div>
          </div>
        </div>
      </div>

      <div v-else class="mt-3">
        <div class="log-toggle-row">
          <span class="text-sm font-medium text-gray-600">Disable Logging</span>
          <label class="relative cursor-pointer">
            <input
              :checked="logDisabled"
              type="checkbox"
              class="sr-only"
              @change="
                $emit(
                  'update:log-disabled',
                  ($event.target as HTMLInputElement).checked,
                );
                $emit('update-log-configuration');
              "
            />
            <div
              class="h-5 w-9 rounded-full shadow-inner transition-colors duration-200 ease-in-out"
              :class="logDisabled ? 'bg-red-500' : 'bg-gray-200'"
            />
            <div
              class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-in-out"
              :class="logDisabled ? 'translate-x-4' : 'translate-x-0'"
            />
          </label>
        </div>

        <div v-if="!logDisabled" class="log-level-section">
          <span class="mb-3 block text-sm font-medium text-gray-600"
            >Level</span
          >
          <div class="segmented-control log-segmented-control">
            <div class="segmented-control-track">
              <div
                class="segmented-control-indicator"
                :class="{ 'no-transition': !enableTransitions }"
                :style="{
                  left: `calc(3px + ${logLevels.indexOf(selectedLogLevel)} * (100% - 6px) / ${logLevels.length})`,
                  width: `calc((100% - 6px) / ${logLevels.length})`,
                }"
              />
              <button
                v-for="level in logLevels"
                :key="level"
                class="segmented-control-option log-option"
                :class="{ active: selectedLogLevel === level }"
                @click="$emit('set-log-level', level)"
              >
                {{ level.charAt(0).toUpperCase() + level.slice(1) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="!hasStackField && !hasLogField && !isLoading"
      class="setting-item-vertical"
    >
      <div class="py-4 text-center text-sm italic text-gray-500">
        No configuration options available for the current config file.
      </div>
    </div>
  </div>
</template>
