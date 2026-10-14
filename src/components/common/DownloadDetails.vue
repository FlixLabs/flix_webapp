<script setup lang="ts">
export interface DownloadDetailRecord { size?: number; remaining?: number | null; timeLeft?: string | null; messages?: string[]; blocked?: boolean; diagnosis?: { hint?: string } }
defineProps<{ record: DownloadDetailRecord }>();
</script>
<template>
  <div class="text-caption mt-2">
    <div>{{ record.remaining == null || !record.size ? 'Remaining size unavailable' : `${(record.remaining / 1e9).toFixed(2)} / ${(record.size / 1e9).toFixed(2)} GB remaining` }}</div>
    <p v-if="record.diagnosis?.hint" class="mt-2">{{ record.diagnosis.hint }}</p>
    <div v-if="record.messages?.length" class="mt-2" :class="record.blocked ? 'text-error' : 'text-medium-emphasis'">
      <strong>{{ record.blocked ? 'Download needs attention' : 'Download messages' }}</strong>
      <ul class="pl-4 text-wrap"><li v-for="message in record.messages" :key="message">{{ message }}</li></ul>
    </div>
    <span v-else-if="record.blocked" class="text-error">Download needs attention; no details provided by the service.</span>
  </div>
</template>
