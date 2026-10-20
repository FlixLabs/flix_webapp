<script setup lang="ts">
import { t, decimal } from '@/i18n';
import { computed, ref, watch } from 'vue';
import DialogSheet from './DialogSheet.vue';
import { useDownloadClients, canRemoveClientTorrent, type ClientTorrent, type DownloadClient } from '@/composables/useDownloadClients';
import { useDialogActivator } from '@/composables/useDialogActivator';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ instance: string | null }>();
const instance = computed(() => props.instance);
const actions = useDownloadClients(instance);
const { clients, loading, removing, error, message, warning, uncertain } = actions;
const clientId = ref<string | null>(null);
const client = computed(() => clients.value.find(item => item.id === clientId.value));
const completed = computed(() => client.value?.torrents.filter(item => item.completed) ?? []);
const search = ref('');
const page = ref(1);
const filtered = computed(() => completed.value.filter(item => item.name.toLowerCase().includes(search.value.trim().toLowerCase())));
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / 10)));
const visibleTorrents = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10));
watch([clientId, search], () => { page.value = 1; });
watch(pageCount, count => { page.value = Math.min(page.value, count); });
const target = ref<{ client: DownloadClient; item: ClientTorrent } | null>(null);
const displayedTarget = ref<typeof target.value>(null);
watch(target, value => { if (value) displayedTarget.value = value; }, { flush: 'sync' });
const confirming = computed({ get: () => target.value !== null, set: value => { if (!value && !removing.value) target.value = null; } });
const activator = useDialogActivator(() => confirming.value);
const deleteData = ref(false);
const force = ref(false);
function resetView() {
  actions.reset(); target.value = null; clientId.value = null; search.value = ''; page.value = 1;
}
function closed() {
  if (!visible.value) resetView();
}
watch(visible, value => {
  if (value) { resetView(); void actions.load(); }
  // Freeze the rendered list during the fade, but reject late network responses immediately.
  else actions.cancel();
});
watch(instance, () => { visible.value = false; target.value = null; });
watch(clients, value => { if (!value.some(item => item.id === clientId.value)) clientId.value = value[0]?.id ?? null; });
function choose(item: ClientTorrent) {
  if (!client.value || !canRemoveClientTorrent(client.value, item, true) || uncertain.value) return;
  deleteData.value = false;
  force.value = false;
  target.value = { client: client.value, item };
}
async function confirm() {
  if (!target.value || (target.value.item.tracked && !force.value)) return;
  await actions.remove(target.value.client, target.value.item, deleteData.value, force.value);
  target.value = null;
}
</script>

<template>
  <DialogSheet :model-value="visible" :title="t('Download clients')" :label="t('Download clients')" :context="instance" :close-disabled="removing || confirming" @update:model-value="visible = $event" @closed="closed">
    <p class="mb-3">{{ t("Inspect completed torrents before cleanup. Seeding torrents are not necessarily leftovers. Active or queued imports block removal, including forced removal.") }}</p>

    <v-alert v-if="error" type="error" variant="tonal" class="mt-3" role="alert">{{ t(error) }}</v-alert>
    <v-alert v-if="warning" type="warning" variant="tonal" class="mt-3" role="alert">{{ t(warning) }}</v-alert>
    <v-alert v-if="message" type="success" variant="tonal" class="mt-3" role="status">{{ t(message) }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" :aria-label="t('Loading download clients')" class="mt-3" />
    <template v-if="clients.length">
      <v-select v-model="clientId" :items="clients" item-value="id" item-title="name" :label="t('Download client')" variant="outlined" class="mt-4" :disabled="removing || confirming" hide-details />
      <p class="text-caption text-medium-emphasis my-3">{{ t("{p0} completed torrents. Active downloads are excluded. Untracked does not guarantee a file has been imported or is safe to delete.", { p0: completed.length }) }}</p>
      <v-alert v-if="!completed.length" type="info" variant="tonal">{{ t("No completed torrents.") }}</v-alert>
      <v-alert v-else-if="!filtered.length" type="info" variant="tonal" class="mb-3">{{ t('No completed torrents match this search. Clear the search to see the remaining torrents.') }}</v-alert>
      <v-text-field v-if="completed.length" :model-value="search" :label="t('Search completed torrents')" prepend-inner-icon="mdi-magnify" variant="outlined" clearable @update:model-value="search = $event ?? ''" hide-details class="mb-3" />
      <v-list :aria-label="t('Completed torrents')" class="client-torrents">
        <v-list-item v-for="item in visibleTorrents" :key="item.id">
          <template #title><span class="text-wrap">{{ item.name }}</span></template>
          <template #subtitle>
            <div class="text-wrap mt-1">{{ t("{p0} · {p1} GB · Ratio: {p2}", { p0: t(item.state), p1: decimal((item.sizeBytes / 1e9)), p2: typeof item.ratio === 'number' ? decimal(item.ratio) : t("Unknown") }) }}</div>
            <div class="text-wrap">{{ item.tracked ? t("Tracked by Radarr / Sonarr") : t("Not currently tracked by Radarr / Sonarr") }}</div>
            <div v-if="item.removalBlockedReason" class="text-warning text-wrap">{{ t(item.removalBlockedReason) }}</div>
            <details class="mt-2"><summary>{{ t("Details") }}</summary><p class="text-break">{{ item.path }}</p><p class="text-break">{{ item.id }}</p></details>
          </template>
          <v-btn color="error" variant="text" prepend-icon="mdi-trash-can-outline" class="mt-2" :aria-label="t('Remove torrent {p0}', { p0: item.name })" :disabled="!client || !canRemoveClientTorrent(client, item, true) || removing || uncertain || loading" @click="choose(item)">{{ t("Remove torrent") }}</v-btn>
        </v-list-item>
      </v-list>
      <v-pagination v-if="pageCount > 1" v-model="page" :length="pageCount" :total-visible="3" density="compact" :aria-label="t('Completed torrent pages')" />
    </template>
    <template #actions><v-btn color="on-surface" :loading="loading" :disabled="removing || confirming" @click="actions.load">{{ clients.length || uncertain ? t("Refresh clients") : t("Load clients") }}</v-btn></template>
  </DialogSheet>
  <DialogSheet :model-value="confirming" :activator="activator" :title="t('Remove torrent?')" :label="t('Remove torrent?')" :context="instance" :close-label="t('Cancel')" :close-disabled="removing" @update:model-value="confirming = $event" @closed="!confirming && (displayedTarget = null)">
    <p class="text-break mb-3">{{ displayedTarget?.item.name }}</p>
    <p>{{ t("Client: {p0}", { p0: displayedTarget?.client.name }) }}</p>
    <v-alert v-if="displayedTarget?.item.tracked" type="warning" variant="tonal" class="mt-3">{{ t("Radarr or Sonarr still tracks this torrent. Removal is allowed only if no active or queued import is detected. This does not remove the media from your library or clear its Radarr/Sonarr queue entry.") }}</v-alert>
    <v-checkbox v-if="displayedTarget?.item.tracked" v-model="force" :label="t('Force removal despite Radarr/Sonarr tracking')" :disabled="removing" hide-details class="mt-3" />
    <v-checkbox v-if="displayedTarget?.client.allowDeleteData" v-model="deleteData" :label="t('Also delete torrent data from disk')" :disabled="removing" hide-details class="mt-3" />
    <v-alert class="mt-3" variant="tonal" :type="deleteData ? 'warning' : 'info'">{{ deleteData ? t("This permanently deletes the torrent data. Imported files may share this location. Verify the paths in your client before continuing. Flix cannot undo this.") : t("Only the torrent will be removed from the client. Files will remain on disk. Seeding will stop.") }}</v-alert>
    <template #actions><v-btn color="error" :loading="removing" :disabled="removing || (!!target?.item.tracked && !force)" @click="confirm">{{ deleteData ? t("Remove torrent and data") : t("Remove torrent only") }}</v-btn></template>
  </DialogSheet>
</template>

<style scoped>
.client-torrents { background: transparent; }
.client-torrents :deep(.v-list-item) { padding-block: 12px; padding-inline: 0; border-bottom: 1px solid var(--flix-border); }
.client-torrents :deep(.v-list-item-subtitle) { display: block; overflow: visible; }
</style>
