<script setup lang="ts">
import { t, formatDate } from '@/i18n';
import { computed, ref, watch } from 'vue';
import { downloadSourceUrl, type DownloadSourceRecord } from '@/composables/useDownloadSourceLinks';
import type { MediaType } from '@/composables/useMediaService';
import { useLocalizedMedia } from '@/composables/useLocalizedMedia';
import DownloadDetails from './DownloadDetails.vue';
import type { DownloadDetailRecord } from './DownloadDetails.vue';
const props = defineProps<{ record: DownloadDetailRecord & DownloadSourceRecord & { title: string; mediaTitle?: string; mediaId?: number; metadata?: { title?: string; tmdbId?: unknown; tvdbId?: unknown }; date?: string; client?: string; indexer?: string; languages?: string }; queue: boolean; mediaType?: MediaType; sourceContext?: string; resolveSource?: (type: MediaType, record: DownloadSourceRecord) => Promise<string | undefined> }>();
const sourceUrl = ref<string>();
watch([() => props.record.downloadId, () => downloadSourceUrl(props.record), () => props.mediaType, () => props.sourceContext], async (_, __, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  sourceUrl.value = undefined;
  const url = await props.resolveSource?.(props.mediaType ?? 'movies', props.record);
  if (current) sourceUrl.value = url;
}, { immediate: true });
const translated = useLocalizedMedia(() => props.record.metadata, () => props.mediaType ?? 'movies');
const title = computed(() => translated.value?.title ?? props.record.mediaTitle ?? props.record.title);
defineEmits<{ open: [event: MouseEvent] }>();
function date(value?: string) {
  if (!value) return t('Not provided');
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatDate(parsed);
}
</script>

<template>
  <div class="download-heading">
    <v-btn v-if="record.mediaId" variant="text" class="download-title download-media-link px-0" :aria-label="t('Open media for {p0}', { p0: record.title })" @click="$emit('open', $event)">{{ title }}</v-btn>
    <div v-else class="download-title font-weight-medium">{{ title }}</div>
    <p v-if="record.mediaTitle && record.mediaTitle !== record.title" class="download-release text-caption text-medium-emphasis" :title="record.title">{{ record.title }}</p>
    <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer" class="text-primary text-caption d-inline-flex align-center ga-1 mt-1" :aria-label="t('View source page for {p0}', { p0: record.title })">{{ t('Source page') }}<v-icon icon="mdi-open-in-new" size="14" aria-hidden="true" /></a>
    <details class="download-metadata text-caption text-medium-emphasis mt-2">
      <summary :aria-label="t('Download details for {p0}', { p0: record.title })">{{ t("Details") }}</summary>
      <dl class="mt-2">
        <template v-if="record.mediaTitle && record.mediaTitle !== record.title"><dt>{{ t("Release") }}</dt><dd>{{ record.title }}</dd></template>
        <dt>{{ queue ? t('Added') : t('Date') }}</dt><dd>{{ date(record.date) }}</dd>
        <template v-if="record.client"><dt>{{ t("Client") }}</dt><dd>{{ record.client }}</dd></template>
        <template v-if="record.indexer"><dt>{{ t("Indexer") }}</dt><dd>{{ record.indexer }}</dd></template>
        <template v-if="record.languages"><dt>{{ t("Languages") }}</dt><dd>{{ record.languages }}</dd></template>
      </dl>
      <DownloadDetails v-if="queue" :record="record" />
    </details>
  </div>
</template>

<style scoped>
.download-heading { min-width: 0; }
.download-title { white-space: normal; overflow-wrap: anywhere; }
.download-media-link { height: auto; min-height: 28px; max-width: 100%; justify-content: flex-start; }
.download-media-link :deep(.v-btn__content) { min-width: 0; text-align: left; overflow-wrap: anywhere; }
.download-release { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.download-metadata summary { cursor: pointer; width: fit-content; }
.download-metadata dd { margin: 0 0 8px; color: rgb(var(--v-theme-on-surface)); overflow-wrap: anywhere; }
</style>
