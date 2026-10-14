<script setup lang="ts">
import MediaFileDetails from './MediaFileDetails.vue';
import MediaMonitoring from './MediaMonitoring.vue';
import MediaHistory from './MediaHistory.vue';
import MediaSettings from './MediaSettings.vue';
import MediaShareLink from './MediaShareLink.vue';
import MediaSummary from './MediaSummary.vue';
import DialogSheet from './DialogSheet.vue';
import ReleaseSelectionDialog from './ReleaseSelectionDialog.vue';
import { computed, ref, watch, useSlots } from 'vue';
import { mediaNeighbors } from '@/composables/mediaNeighbors';
import { useDialogActivator } from '@/composables/useDialogActivator';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  mediaType: 'Movie' | 'Serie';
  item: any | null;
  announcementName: 'Release' | 'Premiere';
  showSearch: boolean;
  showAdd: boolean;
  showRemove: boolean;
  actionPending?: boolean;
  readOnly?: boolean;
  addDisabled?: boolean;
  showFileDetails?: boolean;
  summaryVisible?: boolean;
  activator?: HTMLElement | null;
  navigationItems?: Record<string, unknown>[];
  navigationPending?: boolean;
}>(), {
  showFileDetails: true,
  summaryVisible: true,
});

const emit = defineEmits(['update:modelValue', 'search', 'add', 'remove', 'release-grabbed', 'navigate']);
const releaseDialog = ref(false);
const dialogActivator = useDialogActivator(() => props.modelValue);
const monitoringPending = ref(false);
const settingsPending = ref(false);
const mediaBusy = computed(() => props.readOnly || monitoringPending.value || settingsPending.value);
const neighbors = computed(() => mediaNeighbors(props.navigationItems ?? [], props.item));
const navigationDisabled = computed(() => props.actionPending || props.navigationPending || mediaBusy.value || releaseDialog.value);
function navigate(direction: 'previous' | 'next') {
  const target = neighbors.value[direction];
  if (target && !navigationDisabled.value) emit('navigate', target);
}
watch(() => props.modelValue, value => { if (!value) releaseDialog.value = false; });

function releaseGrabbed() {
  releaseDialog.value = false;
  emit('release-grabbed');
  emit('update:modelValue', false);
}

const renderDetails = ref(props.modelValue);
watch(() => props.modelValue, value => { if (value) renderDetails.value = true; }, { flush: "sync" });
const slots = useSlots();
const hasSupplementalDetails = computed(() => !!slots.details || !!slots.episodes
  || (props.showFileDetails && !!props.item?.relativePath)
  || (props.showRemove && renderDetails.value && Number.isSafeInteger(props.item?.id) && props.item.id > 0));
</script>

<template>
  <DialogSheet v-if="item" :model-value="modelValue" :title="mediaType === 'Movie' ? 'Movie' : 'Series'" :label="`${mediaType === 'Movie' ? 'Movie' : 'Series'}: ${item.title}`" :context="item" :activator="activator ?? dialogActivator" @update:model-value="emit('update:modelValue', $event)" @closed="renderDetails = false">
    <template #header-actions>
      <div v-if="neighbors.index >= 0 && neighbors.total > 1" class="d-flex align-center ga-1" role="group" aria-label="Media navigation">
        <v-btn icon="mdi-chevron-left" variant="text" size="small" aria-label="Previous media" :disabled="navigationDisabled || !neighbors.previous" @click="navigate('previous')" />
        <span class="text-caption text-medium-emphasis" aria-live="polite">{{ neighbors.index + 1 }} / {{ neighbors.total }}</span>
        <v-btn icon="mdi-chevron-right" variant="text" size="small" aria-label="Next media" :disabled="navigationDisabled || !neighbors.next" @click="navigate('next')" />
      </div>
      <MediaShareLink v-if="showRemove && modelValue && Number.isSafeInteger(item.id) && item.id > 0" :key="`${mediaType}-share-${item.id}`" :media-id="item.id" :type="mediaType === 'Movie' ? 'movies' : 'series'" />
    </template>
    <template #default="{ showScrollHint }">
      <slot name="status" />
      <MediaSummary v-if="summaryVisible" :item="item" :announcement-name="announcementName"><slot name="metadata" /></MediaSummary>
      <MediaMonitoring v-if="showRemove && renderDetails" :key="`${mediaType}-${item.id}`" :item="item" :type="mediaType === 'Movie' ? 'movies' : 'series'" :disabled="readOnly || actionPending || settingsPending" @busy="monitoringPending = $event" />
      <div v-if="hasSupplementalDetails" class="media-supplemental-details" :class="{ 'media-details-concealed': showFileDetails && showScrollHint }">
        <slot name="details" />
        <MediaFileDetails v-if="showFileDetails && item.relativePath" :item="item" />
        <slot name="episodes" />
        <MediaSettings v-if="showRemove && renderDetails && Number.isInteger(item.id) && item.id > 0" :key="`${mediaType}-settings-${item.id}`" :item="item" :type="mediaType === 'Movie' ? 'movies' : 'series'" :disabled="readOnly || actionPending || monitoringPending || releaseDialog" @busy="settingsPending = $event" />
        <MediaHistory v-if="showRemove && renderDetails && Number.isInteger(item.id) && item.id > 0" :key="`${mediaType}-history-${item.id}`" :media-id="item.id" :type="mediaType === 'Movie' ? 'movies' : 'series'" />
      </div>
    </template>
    <template #actions>
      <v-btn v-if="showSearch" :disabled="mediaBusy" color="primary" @click="releaseDialog = true">Choose Release</v-btn>
      <v-btn v-if="showSearch" :disabled="mediaBusy" color="primary" @click="emit('search', item)">{{ item.hasFile || item.statistics?.sizeOnDisk > 0 ? 'Search Again' : 'Search' }}</v-btn>
      <v-btn v-if="showAdd" :loading="actionPending" :disabled="actionPending || mediaBusy || addDisabled" color="primary" @click="emit('add', item)">Add</v-btn>
      <v-btn v-if="showRemove" :loading="actionPending" :disabled="actionPending || mediaBusy" color="error" @click="emit('remove', item)">Remove</v-btn>
    </template>
  </DialogSheet>
  <ReleaseSelectionDialog v-model="releaseDialog" :media-type="mediaType === 'Movie' ? 'movies' : 'series'" :item="item" @grabbed="releaseGrabbed" />
</template>

<style scoped>
.media-supplemental-details { display: flow-root; padding-top: 24px; }
.media-supplemental-details:empty { display: none; }
.media-details-concealed { visibility: hidden; }
</style>
