<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useMediaSettings, type MediaSettingsItem } from '@/composables/useMediaSettings';
import type { MediaType } from '@/composables/useMediaService';

const props = defineProps<{ item: MediaSettingsItem; type: MediaType; disabled?: boolean }>();
const emit = defineEmits<{ busy: [value: boolean]; editing: [value: boolean] }>();
const expanded = ref(false); const store = useFlixStore();
const state = useMediaSettings({ useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'), selectedInstanceData: computed(() => store.selectedInstanceData) });
const { profiles, tags, languages, qualityProfileId, selectedTags, languageProfileId, languageEditable, loaded, pending, error, success, dirty } = state;
watch(pending, value => emit('busy', value), { flush: 'sync' });
watch(() => expanded.value && dirty.value, value => emit('editing', value), { flush: 'sync' });
onBeforeUnmount(() => { emit('busy', false); emit('editing', false); });
watch(() => [props.item, props.type, store.selectedInstanceData], () => { expanded.value = false; state.reset(); }, { flush: 'sync' });
watch(expanded, value => { if (value && !loaded.value && !props.disabled) void state.load(props.type, props.item); });
watch(() => props.disabled, value => { if (!value && expanded.value && !loaded.value && !pending.value && !error.value) void state.load(props.type, props.item); });
const unavailable = computed(() => pending.value || props.disabled || !!error.value || !!props.item.settingsNeedsRefresh);
</script>

<template>
  <v-expansion-panels v-model="expanded" class="mt-4" aria-label="Media settings">
    <v-expansion-panel :value="true" title="Media settings" :disabled="pending">
      <v-expansion-panel-text>
        <p class="text-caption text-medium-emphasis mb-3">Change this media's profile and existing tags. No search, file move or deletion is requested.</p>
        <v-progress-linear v-if="pending && !loaded" indeterminate color="primary" aria-label="Loading media settings" />
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ error }}</v-alert>
        <v-alert v-if="success" type="success" variant="tonal" class="mb-3">{{ success }}</v-alert>
        <v-row v-if="loaded">
          <v-col cols="12" sm="6">
            <v-select v-model="qualityProfileId" :items="profiles" label="Quality profile" variant="outlined" :disabled="unavailable" hide-details />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select v-model="selectedTags" :items="tags" label="Tags" multiple chips closable-chips variant="outlined" :disabled="unavailable" hide-details />
          </v-col>
          <v-col v-if="languageEditable" cols="12" sm="6">
            <v-select v-model="languageProfileId" :items="languages" label="Language profile" variant="outlined" :disabled="unavailable" hide-details />
          </v-col>
          <v-col v-else cols="12">
            <p class="text-caption text-medium-emphasis">Language preferences are configured in {{ type === 'movies' ? 'Radarr' : 'Sonarr' }} profiles/custom formats. No separate editable language profile was detected.</p>
          </v-col>
        </v-row>
        <div class="d-flex flex-wrap ga-2 mt-4">
          <v-btn color="primary" variant="tonal" :loading="pending && loaded" :disabled="unavailable || !loaded || !dirty" @click="state.save(type, item)">Save settings</v-btn>
          <v-btn variant="text" :disabled="pending || disabled" @click="state.load(type, item)">Reload settings</v-btn>
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
