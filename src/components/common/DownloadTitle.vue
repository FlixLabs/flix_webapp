<script setup lang="ts">
import DownloadDetails from './DownloadDetails.vue';
import type { DownloadDetailRecord } from './DownloadDetails.vue';
defineProps<{ record: DownloadDetailRecord & { title: string; mediaTitle?: string; mediaId?: number; date?: string; client?: string; indexer?: string; languages?: string }; queue: boolean }>();
defineEmits<{ open: [event: MouseEvent] }>();
function date(value?: string) {
  if (!value) return 'Not provided';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
</script>

<template>
  <div class="download-heading">
    <v-btn v-if="record.mediaId" variant="text" color="primary" class="download-title download-media-link px-0" :aria-label="'Open media for ' + record.title" @click="$emit('open', $event)">{{ record.mediaTitle || record.title }}</v-btn>
    <div v-else class="download-title font-weight-medium">{{ record.mediaTitle || record.title }}</div>
    <p v-if="record.mediaTitle && record.mediaTitle !== record.title" class="download-release text-caption text-medium-emphasis" :title="record.title">{{ record.title }}</p>
    <details class="download-metadata text-caption text-medium-emphasis mt-2">
      <summary :aria-label="'Download details for ' + record.title">Details</summary>
      <dl class="mt-2">
        <template v-if="record.mediaTitle && record.mediaTitle !== record.title"><dt>Release</dt><dd>{{ record.title }}</dd></template>
        <dt>{{ queue ? 'Added' : 'Date' }}</dt><dd>{{ date(record.date) }}</dd>
        <template v-if="record.client"><dt>Client</dt><dd>{{ record.client }}</dd></template>
        <template v-if="record.indexer"><dt>Indexer</dt><dd>{{ record.indexer }}</dd></template>
        <template v-if="record.languages"><dt>Languages</dt><dd>{{ record.languages }}</dd></template>
      </dl>
      <DownloadDetails v-if="queue" :record="record" />
    </details>
  </div>
</template>

<style scoped>
.download-heading { min-width: 0; padding-block: 8px; }
.download-title { white-space: normal; overflow-wrap: anywhere; }
.download-media-link { height: auto; min-height: 28px; max-width: 100%; justify-content: flex-start; }
.download-media-link :deep(.v-btn__content) { min-width: 0; text-align: left; overflow-wrap: anywhere; }
.download-release { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.download-metadata summary { cursor: pointer; width: fit-content; }
.download-metadata dd { margin: 0 0 8px; color: rgb(var(--v-theme-on-surface)); overflow-wrap: anywhere; }
</style>
