<script setup lang="ts">
defineProps<{ record: { size: number; remaining: number | null; timeLeft: string | null; messages: string[]; blocked: boolean } }>();
</script>
<template>
  <div class="text-caption mt-2">
    <div>{{ record.remaining === null ? 'Remaining size unavailable' : `${(record.remaining / 1e9).toFixed(2)} / ${(record.size / 1e9).toFixed(2)} GB remaining` }}</div>
    <div>Time remaining: {{ record.timeLeft || 'Unavailable' }}</div>
    <details v-if="record.messages.length" class="mt-1" :class="record.blocked ? 'text-error' : 'text-medium-emphasis'">
      <summary>{{ record.blocked ? 'Download needs attention' : 'Download messages' }}</summary>
      <ul class="pl-4 text-wrap"><li v-for="message in record.messages" :key="message">{{ message }}</li></ul>
    </details>
    <span v-else-if="record.blocked" class="text-error">Download needs attention; no details provided by the service.</span>
  </div>
</template>
