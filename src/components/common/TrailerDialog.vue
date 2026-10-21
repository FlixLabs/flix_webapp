<script setup lang="ts">
import { computed } from 'vue';
import { t } from '@/i18n';
import { trailerUrls, type Trailer } from '@/composables/mediaTrailers';
import DialogSheet from './DialogSheet.vue';

const props = defineProps<{ modelValue: boolean; video: Trailer | null; mediaTitle: string }>();
defineEmits<{ 'update:modelValue': [value: boolean] }>();
const urls = computed(() => props.video ? trailerUrls(props.video.key) : null);
</script>

<template>
  <DialogSheet :model-value="modelValue" :title="t('Trailer')" :label="t('Trailer: {p0}', { p0: mediaTitle })" :context="video?.key" @update:model-value="$emit('update:modelValue', $event)">
    <template v-if="modelValue && urls">
      <h3 class="text-subtitle-1 mb-3 trailer-title">{{ mediaTitle }}</h3>
      <iframe class="trailer-player" :src="urls.embed" :title="t('Trailer: {p0}', { p0: mediaTitle })" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" />
      <p class="text-caption text-medium-emphasis mt-3">{{ t('If playback is unavailable, open the trailer on YouTube.') }}</p>
    </template>
    <template #actions>
      <v-btn v-if="urls" :href="urls.external" target="_blank" rel="noopener noreferrer" color="primary" prepend-icon="mdi-open-in-new">{{ t('Open on YouTube') }}</v-btn>
    </template>
  </DialogSheet>
</template>

<style scoped>
.trailer-player { display: block; width: 100%; aspect-ratio: 16 / 9; min-height: 200px; border: 0; background: #000; }
.trailer-title { overflow-wrap: anywhere; }
</style>
