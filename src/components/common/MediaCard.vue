<script setup lang="ts">
import { t } from '@/i18n';
import MediaImage from './MediaImage.vue';
import { computed } from 'vue';
import { useLocalizedMedia } from '@/composables/useLocalizedMedia';

const props = defineProps<{
  title: string;
  poster?: string;
  subtitle?: string | number;
  label?: string;
  posterHeight?: number;
  disabled?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  selectionDisabled?: boolean;
  metadata?: { title?: string; overview?: string; tmdbId?: unknown; tvdbId?: unknown };
  mediaType?: 'movies' | 'series' | 'collection';
}>();
const translated = useLocalizedMedia(() => props.metadata, () => props.mediaType ?? 'movies');
const displayTitle = computed(() => translated.value?.title ?? props.title);
const displayLabel = computed(() => props.label ? props.title ? props.label.replace(props.title, displayTitle.value) : props.label : t(props.selectionMode ? 'Select {p0}' : 'Open {p0}', { p0: displayTitle.value }));
const emit = defineEmits<{ open: []; select: [] }>();
function activate() {
  if (props.disabled) return;
  if (props.selectionMode) { if (!props.selectionDisabled) emit('select'); }
  else emit('open');
}
function keyboard(event: KeyboardEvent) { if (!event.repeat && !props.selectionMode) activate(); }
</script>

<template>
  <v-card class="media-card" :disabled="disabled" :aria-label="displayLabel" :role="selectionMode ? 'group' : 'button'" :tabindex="selectionMode ? undefined : disabled ? -1 : 0" :aria-disabled="disabled || undefined" :aria-haspopup="selectionMode ? undefined : 'dialog'" @click="activate" @keydown.enter.self.prevent="keyboard" @keydown.space.self.prevent="keyboard">
    <MediaImage :src="poster" :alt="displayTitle" class="w-100" :height="posterHeight" :aspect-ratio="2 / 3" cover />
    <v-checkbox-btn v-if="selectionMode" class="position-absolute top-0 right-0 bg-surface rounded ma-2" :aria-label="t('Select {p0}', { p0: displayTitle })" :model-value="selected || false" :disabled="selectionDisabled" color="primary" @click.stop @update:model-value="emit('select')" />
    <v-card-title class="title-line text-center text-wrap" :title="displayTitle"><span class="title-text">{{ displayTitle }}</span></v-card-title>
    <v-card-text class="media-date text-center d-flex align-center justify-center">{{ subtitle }}</v-card-text>
    <div class="media-card-status d-flex flex-column justify-center align-center ga-1 px-1 pb-2">
      <div class="media-card-tags d-flex justify-center align-center flex-nowrap ga-1"><slot /></div>
      <slot name="status-caption" />
    </div>
  </v-card>
</template>

<style scoped>
.media-card { height: 100%; }
.title-line { font-size: 1rem; line-height: 1.2; font-weight: bold; height: 3.4rem; display: flex; align-items: center; overflow: hidden; }
.title-text { width: 100%; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: break-word; hyphens: none; }
.media-date { height: 56px; }
.media-card-status { min-height: 64px; align-content: center; }
.media-card-tags { width: 100%; min-width: 0; }
.media-card-tags :deep(.v-chip) { min-width: 0; flex-shrink: 1; }
.media-card-tags :deep(.v-chip__content) { min-width: 0; max-width: 100%; }
</style>
