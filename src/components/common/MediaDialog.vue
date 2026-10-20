<script setup lang="ts">
import { t } from '@/i18n';
import { useLocalizedMedia } from '@/composables/useLocalizedMedia';
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
import { useFlixStore } from '@/stores/flixStore';
import { useMediaSheetRefresh } from '@/composables/useMediaSheetRefresh';
import ReadFeedback from './ReadFeedback.vue';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  mediaType: 'Movie' | 'Serie';
  item: any | null;
  announcementName: 'Release' | 'Premiere';
  showSearch: boolean;
  searchDisabledReason?: string;
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
  libraryItem?: boolean;
}>(), {
  showFileDetails: true,
  summaryVisible: true,
});

const emit = defineEmits(['update:modelValue', 'search', 'add', 'remove', 'release-grabbed', 'navigate', 'refreshed']);
const releaseDialog = ref(false);
const renderDetails = ref(props.modelValue);
const localizedItem = useLocalizedMedia(() => renderDetails.value ? props.item : null, () => props.mediaType === 'Movie' ? 'movies' : 'series');
const dialogActivator = useDialogActivator(() => props.modelValue);
const monitoringPending = ref(false);
const settingsPending = ref(false);
const settingsEditing = ref(false);
const history = ref<InstanceType<typeof MediaHistory> | null>(null);
const store = useFlixStore();
const updates = useMediaSheetRefresh({
  useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'), selectedInstanceData: computed(() => store.selectedInstanceData),
  open: () => props.modelValue, type: () => props.mediaType === 'Movie' ? 'movies' : 'series', item: () => props.item,
  native: () => !!(props.showRemove || props.libraryItem),
  blocked: () => !!((props.readOnly && !props.libraryItem) || props.actionPending || monitoringPending.value || settingsPending.value || settingsEditing.value || releaseDialog.value)
    || document.querySelectorAll('.v-dialog.v-overlay--active').length > 1,
  refreshed: () => { emit('refreshed'); history.value?.refresh(); },
});
const mediaBusy = computed(() => props.readOnly || monitoringPending.value || settingsPending.value || !!updates.state.error);
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

watch(() => props.modelValue, value => { if (value) renderDetails.value = true; }, { flush: "sync" });
const slots = useSlots();
const hasSupplementalDetails = computed(() => !!slots.details || !!slots.episodes
  || (props.showFileDetails && !!props.item?.relativePath)
  || (props.showRemove && renderDetails.value && Number.isSafeInteger(props.item?.id) && props.item.id > 0));
</script>

<template>
  <DialogSheet v-if="item" :model-value="modelValue" :title="mediaType === 'Movie' ? t('Movie') : t('Serie')" :label="`${mediaType === 'Movie' ? t('Movie') : t('Serie')}: ${localizedItem?.title ?? item.title}`" :context="item" :activator="activator ?? dialogActivator" @update:model-value="emit('update:modelValue', $event)" @closed="!modelValue && (renderDetails = false)">
    <template #header-actions>
      <div v-if="neighbors.index >= 0 && neighbors.total > 1" class="d-flex align-center ga-1" role="group" :aria-label="t('Media navigation')">
        <v-btn icon="mdi-chevron-left" variant="text" size="small" :aria-label="t('Previous media')" :disabled="navigationDisabled || !neighbors.previous" @click="navigate('previous')" />
        <span class="text-caption text-medium-emphasis" aria-live="polite">{{ neighbors.index + 1 }} / {{ neighbors.total }}</span>
        <v-btn icon="mdi-chevron-right" variant="text" size="small" :aria-label="t('Next media')" :disabled="navigationDisabled || !neighbors.next" @click="navigate('next')" />
      </div>
      <MediaShareLink v-if="showRemove && modelValue && Number.isSafeInteger(item.id) && item.id > 0" :key="`${mediaType}-share-${item.id}`" :media-id="item.id" :type="mediaType === 'Movie' ? 'movies' : 'series'" />
    </template>
    <template #default="{ showScrollHint }">
      <slot name="status" />
      <ReadFeedback :state="updates.state" :label="t('Media updates')" @retry="updates.refresh" />
      <MediaSummary :media-type="mediaType === 'Movie' ? 'movies' : 'series'" v-if="summaryVisible" :item="item" :announcement-name="announcementName"><slot name="metadata" /></MediaSummary>
      <p v-if="showSearch && searchDisabledReason" role="status" class="text-caption text-medium-emphasis my-3">{{ searchDisabledReason }}</p>
      <MediaMonitoring v-if="showRemove && renderDetails" :key="`${mediaType}-${item.id}`" :item="item" :type="mediaType === 'Movie' ? 'movies' : 'series'" :disabled="mediaBusy || actionPending || settingsPending" @busy="monitoringPending = $event" />
      <div v-if="hasSupplementalDetails" class="media-supplemental-details" :class="{ 'media-details-concealed': showFileDetails && showScrollHint }">
        <slot name="details" />
        <MediaFileDetails v-if="showFileDetails && item.relativePath" :item="item" />
        <slot name="episodes" />
        <MediaSettings v-if="showRemove && renderDetails && Number.isInteger(item.id) && item.id > 0" :key="`${mediaType}-settings-${item.id}`" :item="item" :type="mediaType === 'Movie' ? 'movies' : 'series'" :disabled="readOnly || !!updates.state.error || actionPending || monitoringPending || releaseDialog" @busy="settingsPending = $event" @editing="settingsEditing = $event" />
        <MediaHistory v-if="showRemove && renderDetails && Number.isInteger(item.id) && item.id > 0" ref="history" :key="`${mediaType}-history-${item.id}`" :media-id="item.id" :type="mediaType === 'Movie' ? 'movies' : 'series'" />
      </div>
    </template>
    <template #actions>
      <v-btn v-if="showSearch" :disabled="mediaBusy || actionPending || !!searchDisabledReason" color="primary" @click="releaseDialog = true">{{ t("Choose Release") }}</v-btn>
      <v-btn v-if="showSearch" :disabled="mediaBusy || actionPending || !!searchDisabledReason" color="primary" @click="emit('search', item)">{{ item.hasFile || item.statistics?.sizeOnDisk > 0 ? t("Search Again") : t("Search") }}</v-btn>
      <v-btn v-if="showAdd" :loading="actionPending" :disabled="actionPending || mediaBusy || addDisabled" color="primary" @click="emit('add', item)">{{ t("Add") }}</v-btn>
      <v-btn v-if="showRemove" :loading="actionPending" :disabled="actionPending || mediaBusy" color="error" @click="emit('remove', item)">{{ t("Remove") }}</v-btn>
    </template>
  </DialogSheet>
  <ReleaseSelectionDialog v-model="releaseDialog" :media-type="mediaType === 'Movie' ? 'movies' : 'series'" :item="item" @grabbed="releaseGrabbed" />
</template>

<style scoped>
.media-supplemental-details { display: flow-root; padding-top: 24px; }
.media-supplemental-details:empty { display: none; }
.media-details-concealed { visibility: hidden; }
</style>
