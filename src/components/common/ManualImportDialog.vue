<script setup lang="ts">
import { onUnmounted, watch } from 'vue';
import { useManualImport } from '@/composables/useManualImport';
import type { MediaServiceOptions } from '@/composables/useMediaService';

const props = defineProps<{ options: MediaServiceOptions }>();
const emit = defineEmits<{ requested: []; finished: [] }>();
const actions = useManualImport(props.options);
const { dialog, confirming, type, title, files, media, qualities, episodes, loadingEpisodes, loading,
  busy, error, selected, canReview, commandId, commandState } = actions;
let timer: ReturnType<typeof setInterval> | undefined;
async function check() {
  if (await actions.checkStatus()) emit('finished');
}
watch([dialog, commandId, commandState], () => {
  clearInterval(timer);
  if (dialog.value && commandId.value && ['queued', 'started'].includes(commandState.value)) {
    timer = setInterval(check, 2000);
  }
});
onUnmounted(() => clearInterval(timer));
async function confirm() {
  if (await actions.submit()) emit('requested');
}
function changeMedia(file: typeof files.value[number], id: number | null) {
  file.mediaId = id;
  file.episodeIds = [];
  if (type.value === 'series' && id !== null) void actions.loadEpisodes(id);
}
defineExpose({ open: actions.open, close: actions.close });
</script>

<template>
  <v-dialog :model-value="dialog" max-width="960" scrollable :fullscreen="$vuetify.display.xs" :persistent="busy || confirming || commandId !== null" @update:model-value="value => { if (!value && !busy && !confirming && commandId === null) actions.close(); }">
    <v-card>
      <v-card-title>Manual Import</v-card-title>
      <v-card-subtitle class="text-wrap">{{ title }}</v-card-subtitle>
      <v-card-text>
        <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>
        <v-progress-linear v-if="loading" indeterminate color="primary" aria-label="Inspecting download" />
        <template v-else-if="commandId !== null">
          <v-alert :type="commandState === 'completed' ? 'success' : 'info'">
            Import command #{{ commandId }}: {{ commandState }}.
            <p v-if="commandState === 'completed'">Check Downloads for any files that still need attention.</p>
            <p v-else>Closing this window does not cancel the import.</p>
          </v-alert>
        </template>
        <template v-else>
          <v-alert type="warning" class="mb-4">
            Manual import can replace an existing file, even when its quality is higher.
            Verify the selected files, their media association and quality before confirming.
          </v-alert>
          <v-alert v-if="!files.length && !error" type="info">No importable files found for this download.</v-alert>
          <v-card v-for="file in files" :key="file.path" variant="outlined" class="mb-4">
            <v-card-text>
              <v-checkbox v-model="file.selected" :aria-label="`Select ${file.relativePath || file.name || file.path}`" hide-details :disabled="busy">
                <template #label><span class="text-break">{{ file.relativePath || file.name || file.path }}</span></template>
              </v-checkbox>
              <p class="text-caption text-medium-emphasis text-break mb-3">{{ file.path }}</p>
              <v-row>
                <v-col cols="12" sm="6">
                  <v-autocomplete :model-value="file.mediaId" :items="media" :item-title="item => `${item.title}${item.year ? ` (${item.year})` : ''}`" item-value="id" :label="type === 'movies' ? 'Movie' : 'Series'" variant="outlined" hide-details :disabled="busy" @update:model-value="id => changeMedia(file, id)" />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-select v-model="file.qualityId" :items="qualities" item-title="name" item-value="id" label="Quality" variant="outlined" hide-details :disabled="busy" />
                </v-col>
                <v-col v-if="type === 'series'" cols="12">
                  <v-select v-model="file.episodeIds" :items="episodes[file.mediaId ?? 0] ?? []" :item-title="episode => `S${episode.seasonNumber} E${episode.episodeNumber} · ${episode.title}`" item-value="id" label="Episodes" variant="outlined" multiple chips hide-details :loading="loadingEpisodes[file.mediaId ?? 0]" :disabled="busy || !file.mediaId" />
                </v-col>
              </v-row>
              <p class="text-caption mt-3">{{ ((file.size ?? 0) / 1e9).toFixed(2) }} GB · Languages: {{ file.languages?.map(language => language.name).join(', ') || 'Unknown' }}</p>
              <v-alert v-if="file.rejections?.length" type="warning" variant="tonal" class="mt-3">
                <ul class="pl-4"><li v-for="rejection in file.rejections" :key="rejection.reason">{{ rejection.reason }}</li></ul>
              </v-alert>
            </v-card-text>
          </v-card>
        </template>
      </v-card-text>
      <v-card-actions class="flex-wrap">
        <v-spacer />
        <v-btn :disabled="busy" @click="actions.close">Close</v-btn>
        <v-btn v-if="commandId !== null" color="primary" :loading="busy" @click="check">Check status</v-btn>
        <v-btn v-else color="primary" :loading="busy" :disabled="loading || !canReview" @click="actions.review">Review Import ({{ selected.length }})</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="confirming" max-width="640" :persistent="busy">
    <v-card>
      <v-card-title>Confirm Manual Import</v-card-title>
      <v-card-text>
        <v-alert type="warning" class="mb-4">Existing files may be replaced. Importing manually can bypass quality rejection rules. This cannot be undone from Flix.</v-alert>
        <p v-for="file in selected" :key="file.path" class="text-break mb-2">
          {{ file.relativePath || file.name || file.path }} → {{ media.find(item => item.id === file.mediaId)?.title }} · {{ qualities.find(item => item.id === file.qualityId)?.name }}
        </p>
        <ul class="pl-4 text-warning"><li v-for="(reason, index) in selected.flatMap(file => file.rejections ?? [])" :key="index">{{ reason.reason }}</li></ul>
        <v-alert v-if="error" type="error" class="mt-4">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="busy" @click="confirming = false">Cancel</v-btn>
        <v-btn color="warning" :loading="busy" :disabled="!canReview" @click="confirm">Confirm Import</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
