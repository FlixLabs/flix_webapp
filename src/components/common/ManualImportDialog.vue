<script setup lang="ts">
import { t, decimal } from '@/i18n';
import { onUnmounted, ref, watch } from 'vue';
import { useDialogActivator, preserveNestedDialogFocus } from '@/composables/useDialogActivator';
import { useManualImport } from '@/composables/useManualImport';
import ManualImportStatus from './ManualImportStatus.vue';
import type { MediaServiceOptions } from '@/composables/useMediaService';

const props = defineProps<{ options: MediaServiceOptions }>();
const emit = defineEmits<{ requested: []; finished: [] }>();
const actions = useManualImport(props.options);
const { dialog, confirming, type, title, files, media, qualities, languages, episodes, loadingEpisodes, loading,
  busy, error, selected, canReview, commandId, commandState } = actions;
const dialogActivator = useDialogActivator(() => dialog.value);
const confirmationActivator = useDialogActivator(() => confirming.value);
const cancelButton = ref<{ $el: HTMLElement } | null>(null);
const importCard = ref<{ $el: HTMLElement } | null>(null);
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
defineExpose({ open: actions.open, close: actions.close, isOpen: dialog });
</script>

<template>
  <v-dialog :model-value="dialog" :activator="dialogActivator" :open-on-click="false" :aria-label="t('Manual Import - {p0}', { p0: title })" max-width="960" scrollable :fullscreen="$vuetify.display.xs" :persistent="busy || confirming || commandId !== null" @after-enter="preserveNestedDialogFocus(importCard?.$el)" @update:model-value="value => { if (!value && !busy && !confirming && commandId === null) actions.close(); }">
    <v-card ref="importCard">
      <v-card-title>{{ t("Manual Import") }}</v-card-title>
      <v-card-subtitle class="text-wrap">{{ title }}</v-card-subtitle>
      <v-card-text>
        <v-alert v-if="error" type="error" class="mb-4">{{ t(error) }}</v-alert>
        <v-progress-linear v-if="loading" indeterminate color="primary" :aria-label="t('Inspecting download')" />
        <template v-else-if="commandId !== null">
          <ManualImportStatus :status="commandState" :command-id="commandId" />
        </template>
        <template v-else>
          <v-alert type="warning" class="mb-4">{{ t("Manual import can replace an existing file, even when its quality is higher. Verify the selected files, their media association and quality before confirming.") }}</v-alert>
          <v-alert v-if="!files.length && !error" type="info">{{ t("No importable files found for this download.") }}</v-alert>
          <v-card v-for="file in files" :key="file.path" variant="outlined" class="mb-4">
            <v-card-text>
              <v-checkbox v-model="file.selected" :aria-label="t('Select {p0}', { p0: file.relativePath || file.name || file.path })" hide-details :disabled="busy">
                <template #label><span class="text-break">{{ file.relativePath || file.name || file.path }}</span></template>
              </v-checkbox>
              <p class="text-caption text-medium-emphasis text-break mb-3">{{ file.path }}</p>
              <v-row>
                <v-col cols="12" sm="6">
                  <v-autocomplete :model-value="file.mediaId" :items="media" :item-title="item => `${item.title}${item.year ? ` (${item.year})` : ''}`" item-value="id" :label="type === 'movies' ? t('Movie') : t('Series')" variant="outlined" hide-details :disabled="busy" @update:model-value="id => changeMedia(file, id)" />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-select v-model="file.qualityId" :items="qualities" item-title="name" item-value="id" :label="t('Quality')" variant="outlined" hide-details :disabled="busy" />
                </v-col>
                <v-col cols="12">
                  <v-select v-model="file.languages" :items="languages" :item-title="language => t(language.name)" item-value="id" :label="t('Languages')" variant="outlined" multiple chips closable-chips return-object hide-details :disabled="busy" />
                </v-col>
                <v-col v-if="type === 'series'" cols="12">
                  <v-select v-model="file.episodeIds" :items="episodes[file.mediaId ?? 0] ?? []" :item-title="episode => `S${episode.seasonNumber} E${episode.episodeNumber} · ${episode.title}`" item-value="id" :label="t('Episodes')" variant="outlined" multiple chips hide-details :loading="loadingEpisodes[file.mediaId ?? 0]" :disabled="busy || !file.mediaId" />
                </v-col>
              </v-row>
              <p class="text-caption mt-3">{{ t('Size (GB)') }}: {{ decimal(((file.size ?? 0) / 1e9)) }}</p>
              <v-alert v-if="file.rejections?.length" type="warning" variant="tonal" class="mt-3">
                <ul class="pl-4"><li v-for="rejection in file.rejections" :key="rejection.reason">{{ rejection.reason }}</li></ul>
              </v-alert>
            </v-card-text>
          </v-card>
        </template>
      </v-card-text>
      <v-card-actions class="flex-wrap">
        <v-spacer />
        <v-btn color="on-surface" :disabled="busy" @click="actions.close">{{ t("Close") }}</v-btn>
        <v-btn v-if="commandId !== null" color="on-surface" :loading="busy" @click="check">{{ t("Check status") }}</v-btn>
        <v-btn v-else color="primary" :loading="busy" :disabled="loading || !canReview" @click="actions.review">{{ t("Review Import ({p0})", { p0: selected.length }) }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="confirming" :activator="confirmationActivator" :open-on-click="false" :aria-label="t('Confirm Manual Import')" max-width="640" :persistent="busy" @after-enter="cancelButton?.$el.focus({ preventScroll: true })">
    <v-card>
      <v-card-title>{{ t("Confirm Manual Import") }}</v-card-title>
      <v-card-text>
        <v-alert type="warning" class="mb-4">{{ t("Existing files may be replaced. Importing manually can bypass quality rejection rules. This cannot be undone from Flix.") }}</v-alert>
        <p v-for="file in selected" :key="file.path" class="text-break mb-2">
          {{ file.relativePath || file.name || file.path }} → {{ media.find(item => item.id === file.mediaId)?.title }} · {{ qualities.find(item => item.id === file.qualityId)?.name }}
          <span class="d-block text-caption text-medium-emphasis">{{ t('Languages') }}: {{ file.languages?.map(language => t(language.name)).join(', ') || t('Unknown') }}</span>
        </p>
        <ul class="pl-4 text-warning"><li v-for="(reason, index) in selected.flatMap(file => file.rejections ?? [])" :key="index">{{ reason.reason }}</li></ul>
        <v-alert v-if="error" type="error" class="mt-4">{{ t(error) }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="on-surface" ref="cancelButton" :disabled="busy" @click="confirming = false">{{ t("Cancel") }}</v-btn>
        <v-btn color="warning" :loading="busy" :disabled="!canReview" @click="confirm">{{ t("Confirm Import") }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
