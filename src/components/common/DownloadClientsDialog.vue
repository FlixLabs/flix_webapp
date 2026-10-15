<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DialogSheet from './DialogSheet.vue';
import { useDownloadClients, type ClientTorrent, type DownloadClient } from '@/composables/useDownloadClients';
import { useDialogActivator } from '@/composables/useDialogActivator';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ instance: string | null }>();
const instance = computed(() => props.instance);
const actions = useDownloadClients(instance);
const { clients, loading, removing, error, message, uncertain } = actions;
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
const confirming = computed({ get: () => target.value !== null, set: value => { if (!value && !removing.value) target.value = null; } });
const activator = useDialogActivator(() => confirming.value);
const deleteData = ref(false);
const force = ref(false);
watch(visible, value => { if (value) { void actions.load(); } else if (!value) { actions.reset(); target.value = null; clientId.value = null; search.value = ''; } });
watch(instance, () => { visible.value = false; target.value = null; });
watch(clients, value => { if (!value.some(item => item.id === clientId.value)) clientId.value = value[0]?.id ?? null; });
function choose(item: ClientTorrent) {
  if (!client.value || (!item.removable && !(item.tracked && item.completed && client.value.allowForceRemoval)) || uncertain.value) return;
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
  <DialogSheet :model-value="visible" title="Download clients" label="Download clients" :context="instance" :close-disabled="removing || confirming" @update:model-value="visible = $event">
    <p class="mb-3">Inspect completed torrents before cleanup. Seeding torrents are not necessarily leftovers. Removing a tracked torrent requires explicit confirmation and may interrupt its import.</p>

    <v-alert v-if="error" type="error" variant="tonal" class="mt-3" role="alert">{{ error }}</v-alert>
    <v-alert v-if="message" type="success" variant="tonal" class="mt-3" role="status">{{ message }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate color="primary" aria-label="Loading download clients" class="mt-3" />
    <template v-if="clients.length">
      <v-select v-model="clientId" :items="clients" item-value="id" item-title="name" label="Download client" variant="outlined" class="mt-4" :disabled="removing || confirming" hide-details />
      <p class="text-caption text-medium-emphasis my-3">{{ completed.length }} completed torrents. Active downloads are excluded. Untracked does not guarantee a file has been imported or is safe to delete.</p>
      <v-alert v-if="!completed.length" type="info" variant="tonal">No completed torrents.</v-alert>
      <v-text-field v-if="completed.length" :model-value="search" label="Search completed torrents" prepend-inner-icon="mdi-magnify" variant="outlined" clearable @update:model-value="search = $event ?? ''" hide-details class="mb-3" />
      <v-list aria-label="Completed torrents" class="client-torrents">
        <v-list-item v-for="item in visibleTorrents" :key="item.id">
          <template #title><span class="text-wrap">{{ item.name }}</span></template>
          <template #subtitle>
            <div class="text-wrap mt-1">{{ item.state }} · {{ (item.sizeBytes / 1e9).toFixed(2) }} GB · Ratio: {{ item.ratio ?? 'Unknown' }}</div>
            <div class="text-wrap">{{ item.tracked ? 'Tracked by Radarr / Sonarr' : 'Not currently tracked by Radarr / Sonarr' }}</div>
            <details class="mt-2"><summary>Details</summary><p class="text-break">{{ item.path }}</p><p class="text-break">{{ item.id }}</p></details>
          </template>
          <v-btn color="error" variant="text" prepend-icon="mdi-trash-can-outline" class="mt-2" :aria-label="`Remove torrent ${item.name}`" :disabled="(!item.removable && !(item.tracked && client?.allowForceRemoval)) || removing || uncertain || loading" @click="choose(item)">Remove torrent</v-btn>
        </v-list-item>
      </v-list>
      <v-pagination v-if="pageCount > 1" v-model="page" :length="pageCount" :total-visible="3" density="compact" aria-label="Completed torrent pages" />
    </template>
    <template #actions><v-btn color="on-surface" :loading="loading" :disabled="removing || confirming" @click="actions.load">{{ clients.length || uncertain ? 'Refresh clients' : 'Load clients' }}</v-btn></template>
  </DialogSheet>
  <DialogSheet :model-value="confirming" :activator="activator" title="Remove torrent?" label="Remove torrent?" :context="instance" close-label="Cancel" :close-disabled="removing" @update:model-value="confirming = $event">
    <p class="text-break mb-3">{{ target?.item.name }}</p>
    <p>Client: {{ target?.client.name }}</p>
    <v-alert v-if="target?.item.tracked" type="warning" variant="tonal" class="mt-3">Radarr or Sonarr still tracks this torrent. Forcing removal may interrupt its import. This does not remove the media from your library or clear its Radarr/Sonarr queue entry.</v-alert>
    <v-checkbox v-if="target?.item.tracked" v-model="force" label="Force removal despite Radarr/Sonarr tracking" :disabled="removing" hide-details class="mt-3" />
    <v-checkbox v-if="target?.client.allowDeleteData" v-model="deleteData" label="Also delete torrent data from disk" :disabled="removing" hide-details class="mt-3" />
    <v-alert class="mt-3" variant="tonal" :type="deleteData ? 'warning' : 'info'">{{ deleteData ? 'This permanently deletes the torrent data. Imported files may share this location. Verify the paths in your client before continuing. Flix cannot undo this.' : 'Only the torrent will be removed from the client. Files will remain on disk. Seeding will stop.' }}</v-alert>
    <template #actions><v-btn color="error" :loading="removing" :disabled="removing || (!!target?.item.tracked && !force)" @click="confirm">{{ deleteData ? 'Remove torrent and data' : 'Remove torrent only' }}</v-btn></template>
  </DialogSheet>
</template>

<style scoped>
.client-torrents { background: transparent; }
.client-torrents :deep(.v-list-item) { padding-block: 12px; padding-inline: 0; border-bottom: 1px solid var(--flix-border); }
.client-torrents :deep(.v-list-item-subtitle) { display: block; overflow: visible; }
</style>
