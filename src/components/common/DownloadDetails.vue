<script setup lang="ts">
import { t, decimal } from '@/i18n';
export interface DownloadDetailRecord { size?: number; remaining?: number | null; timeLeft?: string | null; messages?: string[]; blocked?: boolean; diagnosis?: { hint?: string } }
defineProps<{ record: DownloadDetailRecord }>();
</script>
<template>
  <div class="text-caption mt-2">
    <div>{{ record.remaining == null || !record.size ? t("Remaining size unavailable") : t("{p0} / {p1} GB remaining", { p0: decimal((record.remaining / 1e9)), p1: decimal((record.size / 1e9)) }) }}</div>
    <p v-if="record.diagnosis?.hint" class="mt-2">{{ t(record.diagnosis.hint) }}</p>
    <div v-if="record.messages?.length" class="mt-2" :class="record.blocked ? 'text-error' : 'text-medium-emphasis'">
      <strong>{{ record.blocked ? t("Download needs attention") : t("Download messages") }}</strong>
      <ul class="pl-4 text-wrap"><li v-for="message in record.messages" :key="message">{{ t(message) }}</li></ul>
    </div>
    <span v-else-if="record.blocked" class="text-error">{{ t("Download needs attention; no details provided by the service.") }}</span>
  </div>
</template>
