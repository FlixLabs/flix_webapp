<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { t } from '@/i18n';
import { trailerUrls, type Trailer } from '@/composables/mediaTrailers';
import DialogSheet from './DialogSheet.vue';
import { useDialogSnapshot } from '@/composables/useDialogSnapshot';

const props = defineProps<{ modelValue: boolean; video: Trailer | null; mediaTitle: string }>();
defineEmits<{ 'update:modelValue': [value: boolean] }>();
const { displayed, closed } = useDialogSnapshot(() => props.modelValue, () => ({ video: props.video, title: props.mediaTitle }));
const urls = computed(() => displayed.value?.video ? trailerUrls(displayed.value.video.key) : null);
const loaded = ref(false);
const frame = ref<HTMLIFrameElement | null>(null);
function playerLoaded(event: Event) {
  if (props.modelValue && event.target === frame.value) loaded.value = true;
}
watch(() => [props.modelValue, props.video?.key], () => { loaded.value = false; }, { flush: 'sync' });
</script>

<template>
  <DialogSheet :model-value="modelValue" :title="t('Trailer')" :label="t('Trailer: {p0}', { p0: displayed?.title ?? mediaTitle })" :context="displayed?.video?.key" @update:model-value="$emit('update:modelValue', $event)" @closed="closed">
    <template v-if="urls">
      <h3 class="text-subtitle-1 mb-3 trailer-title">{{ displayed?.title }}</h3>
      <div class="trailer-stage">
        <iframe v-if="modelValue" ref="frame" :key="displayed?.video?.key" class="trailer-player" :class="{ 'trailer-player-ready': loaded }" :src="urls.embed" :title="t('Trailer: {p0}', { p0: displayed?.title })" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" @load="playerLoaded" />
      </div>
      <p class="text-caption text-medium-emphasis mt-3">{{ t('If playback is unavailable, open the trailer on YouTube.') }}</p>
    </template>
    <template #actions>
      <v-btn v-if="urls" :href="urls.external" target="_blank" rel="noopener noreferrer" color="primary" prepend-icon="mdi-open-in-new">{{ t('Open on YouTube') }}</v-btn>
    </template>
  </DialogSheet>
</template>

<style scoped>
.trailer-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; min-height: 200px; background: #000; }
.trailer-player { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; color-scheme: dark; visibility: hidden; }
.trailer-player-ready { visibility: visible; }
.trailer-title { overflow-wrap: anywhere; }
</style>
