<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { removableCollectionMovies, useCollectionRemoval, type CollectionRemovalTarget, type RemovableCollectionMovie } from '@/composables/useCollectionRemoval';
import DialogSheet from './DialogSheet.vue';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ collection: CollectionRemovalTarget | null; movies: RemovableCollectionMovie[]; context: string; disabled: boolean; activator?: HTMLElement | null }>();
const emit = defineEmits<{ refresh: [] }>();
const store = useFlixStore();
const { pending, results, error, run } = useCollectionRemoval({
  useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'), selectedInstanceData: computed(() => store.selectedInstanceData),
});
const snapshot = ref<RemovableCollectionMovie[]>([]);
const target = ref<CollectionRemovalTarget | null>(null);
const selectedIds = ref<number[]>([]);
const deleteFiles = ref(false);
const submitted = ref(false);
const selected = computed(() => snapshot.value.filter(movie => selectedIds.value.includes(movie.tmdbId)));
watch(visible, value => {
  if (!value) return;
  snapshot.value = removableCollectionMovies(props.movies).map(movie => ({ ...movie }));
  target.value = props.collection ? { ...props.collection } : null;
  selectedIds.value = snapshot.value.map(movie => movie.tmdbId);
  deleteFiles.value = false; submitted.value = false; results.value = []; error.value = '';
}, { immediate: true });
watch(() => props.context, () => { visible.value = false; }, { flush: 'sync' });
async function confirm() {
  if (pending.value || submitted.value || props.disabled || !target.value || !selected.value.length) return;
  submitted.value = true;
  const context = props.context;
  await run(target.value, selected.value, deleteFiles.value);
  if (context === props.context && results.value.some(result => result.state === 'removed' || result.state === 'unconfirmed')) emit('refresh');
}
function close(value: boolean) { if (!pending.value) visible.value = value; }
function closed() {
  if (props.activator && !props.activator.isConnected) {
    // Removing all local members also removes the collection's activator.
    document.querySelector<HTMLElement>('[aria-label="Media type"] .v-btn--active')?.focus({ preventScroll: true });
  }
}
</script>

<template>
  <DialogSheet :model-value="visible" :activator="activator" title="Remove collection movies" label="Remove collection movies" :context="context" :close-disabled="pending" @update:model-value="close" @closed="closed">
    <p class="mb-3">Select the library films to remove from {{ target?.title }}. Films not in your library are excluded.</p>
    <v-list density="compact" aria-label="Collection movies to remove">
      <v-list-item v-for="movie in snapshot" :key="movie.tmdbId" :subtitle="movie.year ? String(movie.year) : undefined">
        <template #title><span class="text-wrap">{{ movie.title }}</span></template>
        <template #prepend><v-checkbox-btn v-model="selectedIds" :value="movie.tmdbId" :aria-label="`Remove ${movie.title}`" :disabled="pending || submitted || disabled" /></template>
      </v-list-item>
    </v-list>
    <v-checkbox v-model="deleteFiles" label="Also delete movie files from disk" :disabled="pending || submitted || disabled" hide-details />
    <v-alert class="mt-3" :type="deleteFiles ? 'warning' : 'info'" variant="tonal">{{ deleteFiles ? 'Selected films and their files will be removed. This cannot be undone in Flix.' : 'Selected films will be removed from Radarr. Their files will remain on disk.' }}</v-alert>
    <p class="text-caption text-medium-emphasis mt-3">Radarr lists or collection monitoring may add films again. Their settings are not changed by this action.</p>
    <v-alert v-if="error" type="error" variant="tonal" class="mt-3">{{ error }}</v-alert>
    <v-list v-if="results.length" density="compact" aria-label="Removal results" aria-live="polite">
      <v-list-item v-for="result in results" :key="result.tmdbId" :subtitle="result.message" :prepend-icon="result.state === 'removed' ? 'mdi-check-circle-outline' : result.state === 'skipped' ? 'mdi-minus-circle-outline' : 'mdi-alert-circle-outline'"><template #title><span class="text-wrap">{{ result.title }}</span></template></v-list-item>
    </v-list>
    <template #actions><v-btn color="error" :loading="pending" :disabled="pending || submitted || disabled || !selected.length || !target" @click="confirm">Remove selected ({{ selected.length }})</v-btn></template>
  </DialogSheet>
</template>
