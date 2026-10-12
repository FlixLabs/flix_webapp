<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DeleteConfirmationDialog from './DeleteConfirmationDialog.vue';
import { useBulkMediaActions, type BulkAction, type BulkMedia } from '@/composables/useBulkMediaActions';
import type { MediaInstance, MediaType } from '@/composables/useMediaService';

const props = defineProps<{ items: BulkMedia[]; type: MediaType; useApi: boolean; instance: MediaInstance | null; selectedIds: number[]; pageSelectionDisabled?: boolean }>();
const emit = defineEmits<{ 'update:selectedIds': [ids: number[]]; busy: [value: boolean]; refresh: []; 'select-page': [] }>();
const { pending, completed, total, stopRequested, run, stop, invalidate } = useBulkMediaActions({
  useAPI: computed(() => props.useApi), selectedInstanceData: computed(() => props.instance),
});
watch(pending, value => emit('busy', value), { flush: 'sync' });
const selection = computed(() => props.items.filter(item => props.selectedIds.includes(item.id!)));
const report = ref('');
const hasFailures = ref(false);
const confirmation = ref(false);
let deletionSnapshot: BulkMedia[] = [];
let resultSelectionUpdate = false;
watch(() => [props.type, props.instance], () => {
  confirmation.value = false; deletionSnapshot = []; report.value = ''; invalidate();
}, { flush: 'sync' });
watch(() => props.items.map(item => item.id).join(','), () => {
  confirmation.value = false; deletionSnapshot = []; invalidate();
}, { flush: 'sync' });
watch(() => props.selectedIds, () => {
  if (resultSelectionUpdate) { resultSelectionUpdate = false; return; }
  if (pending.value) invalidate();
  report.value = '';
}, { flush: 'sync' });

function requestDeletion() { deletionSnapshot = [...selection.value]; confirmation.value = true; }
async function execute(action: BulkAction) {
  if (pending.value) return;
  report.value = '';
  const result = await run(props.type, action === 'delete' ? deletionSnapshot : [...selection.value], action);
  deletionSnapshot = [];
  if (!result || result.stale) return;
  resultSelectionUpdate = true;
  emit('update:selectedIds', props.selectedIds.filter(id => !result.succeeded.includes(id)));
  hasFailures.value = !!result.failed.length || !!result.skipped.length || result.stopped;
  report.value = `${result.succeeded.length} succeeded, ${result.failed.length} failed, ${result.skipped.length} skipped${result.stopped ? '. Stopped before all media were processed' : ''}.`;
  if (action === 'delete' && result.succeeded.length) emit('refresh');
}
</script>

<template>
  <v-card variant="outlined" class="my-3 pa-3">
    <v-row align="center">
      <v-col cols="12" sm="6">
        <div class="text-body-2 mb-2">{{ selectedIds.length }} selected across pages</div>
        <v-btn size="small" variant="text" :disabled="pending || pageSelectionDisabled" @click="emit('select-page')">Select page</v-btn>
      </v-col>
      <v-col cols="12" sm="6" class="d-flex justify-end ga-2">
        <v-menu>
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" size="small" variant="tonal" color="primary" append-icon="mdi-chevron-down" :disabled="pending || !selection.length">Selection actions</v-btn>
          </template>
          <v-list role="menu" density="compact" :disabled="pending || !selection.length">
            <v-list-item role="menuitem" title="Monitor selected" @click="execute('monitor')" />
            <v-list-item role="menuitem" title="Unmonitor selected" @click="execute('unmonitor')" />
            <v-list-item role="menuitem" title="Search selected" @click="execute('search')" />
            <v-divider />
            <v-list-item role="menuitem" title="Clear selection" @click="emit('update:selectedIds', [])" />
            <v-list-item role="menuitem" title="Remove selected" base-color="error" @click="requestDeletion" />
          </v-list>
        </v-menu>
        <v-btn size="small" variant="text" aria-label="Stop after current item" :disabled="!pending || stopRequested" @click="stop">Stop</v-btn>
      </v-col>
    </v-row>
    <div v-if="pending" class="mt-3">
      <v-progress-linear :model-value="total ? completed / total * 100 : 0" color="primary" />
      <div class="mt-2">
        <span class="text-caption">{{ completed }} / {{ total }} processed</span>
      </div>
    </div>
    <v-alert v-if="report" :type="hasFailures ? 'warning' : 'success'" variant="tonal" class="mt-3">{{ report }}</v-alert>
  </v-card>
  <DeleteConfirmationDialog
    v-model="confirmation"
    :message="`Remove ${deletionSnapshot.length} selected ${type} from the library and delete their files? This cannot be undone.`"
    @confirm="execute('delete')"
    @cancel="deletionSnapshot = []"
  />
</template>
