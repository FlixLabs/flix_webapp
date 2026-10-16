<script setup lang="ts">
import { t, formatDate } from '@/i18n';
import { computed } from 'vue';
import { fileSizeGb, type MediaFileDetails } from '@/composables/mediaFileDetails';

const props = defineProps<{ item: {
  relativePath?: string | null;
  sizeOnDisk?: number | null;
  quality?: string | null;
  statistics?: { sizeOnDisk?: number | null };
  fileDetails?: MediaFileDetails;
} }>();
const fields = computed(() => {
  const info = props.item.fileDetails;
  return [
    { label: 'Size (GB)', value: fileSizeGb(props.item.sizeOnDisk ?? props.item.statistics?.sizeOnDisk) },
    { label: 'Quality', value: props.item.quality },
    { label: 'Resolution', value: info?.resolution },
    { label: 'Video codec', value: info?.videoCodec },
    { label: 'Audio codec', value: info?.audioCodec },
    { label: 'Audio languages', value: info?.audioLanguages },
    { label: 'Subtitles', value: info?.subtitles },
    { label: 'File added', value: info?.dateAdded ? formatDate(new Date(info.dateAdded)) : null },
  ];
});
</script>

<template>
  <v-row class="media-file-details">
    <v-col cols="12">
      <v-tooltip :text="item.relativePath || ''">
        <template #activator="{ props: tooltipProps }">
          <span v-bind="tooltipProps">
            <v-text-field :label="t('File')" variant="outlined" :model-value="item.relativePath" disabled />
          </span>
        </template>
      </v-tooltip>
      <v-row tag="dl" class="mt-0">
        <v-col v-for="field in fields" :key="field.label" cols="12" sm="6">
          <dt class="text-caption text-medium-emphasis">{{ t(field.label) }}</dt>
          <dd class="text-body-2 text-break ma-0">{{ field.value || t("Not provided") }}</dd>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>
