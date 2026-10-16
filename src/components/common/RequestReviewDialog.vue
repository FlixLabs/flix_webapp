<script setup lang="ts">
import { ref, watch } from 'vue';
import { t } from '@/i18n';
import { requestsApi, requestItems, requestStrings, type MediaRequest } from '@/composables/mediaRequests';
import DialogSheet from './DialogSheet.vue';
const props = defineProps<{ request: MediaRequest | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const instances = ref<string[]>([]);
const instance = ref('');
const profiles = ref<{ id: number; name: string }[]>([]);
const folders = ref<string[]>([]);
const profileId = ref<number | null>(null);
const rootFolder = ref('');
const reason = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const attempted = ref(false);
let generation = 0;
watch(() => props.request, async request => {
  const current = ++generation;
  reason.value = ''; error.value = ''; attempted.value = false; instance.value = ''; profiles.value = []; folders.value = [];
  if (!request) return;
  loading.value = true;
  try {
    const data = await requestsApi('/options');
    if (current !== generation) return;
    instances.value = requestStrings(data.instances);
    instance.value = instances.value[0] ?? '';
  } catch (cause) { if (current === generation) error.value = cause instanceof Error ? cause.message : 'Requests unavailable.'; }
  finally { if (current === generation) loading.value = false; }
});
let optionGeneration = 0;
watch(instance, async value => {
  const current = ++optionGeneration;
  const request = props.request;
  profileId.value = null; rootFolder.value = ''; profiles.value = []; folders.value = [];
  if (!value || !request) return;
  loading.value = true; error.value = '';
  try {
    const data = await requestsApi(`/options?type=${request.type}&instance=${encodeURIComponent(value)}`);
    if (current !== optionGeneration || request !== props.request) return;
    profiles.value = requestItems<{ id: number; name: string }>(data.profiles, 'quality profiles');
    folders.value = requestStrings(data.folders);
    profileId.value = profiles.value[0]?.id ?? null;
    rootFolder.value = folders.value[0] ?? '';
  } catch (cause) { if (current === optionGeneration) error.value = cause instanceof Error ? cause.message : 'Requests unavailable.'; }
  finally { if (current === optionGeneration) loading.value = false; }
});
async function decide(action: 'approve' | 'reject') {
  if (!props.request || saving.value) return;
  saving.value = true; error.value = '';
  try {
    await requestsApi(`/${props.request.id}/${action}`, { method: 'POST', signal: AbortSignal.timeout(120000), body: JSON.stringify(action === 'approve' ? { instance: instance.value, profileId: profileId.value, rootFolder: rootFolder.value } : { reason: reason.value }) });
    emit('saved'); emit('close');
  } catch (cause) { attempted.value = true; error.value = cause instanceof Error ? cause.message : 'Requests unavailable.'; emit('saved'); }
  finally { saving.value = false; }
}
</script>

<template>
  <DialogSheet :model-value="!!request" :title="t('Review request')" :label="t('Review request')" :close-label="t('Close')" :context="request?.id" :close-disabled="saving" @update:model-value="!$event && emit('close')">
    <h2 class="text-h6 mb-3">{{ request?.title }}</h2>
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ t(error) }}</v-alert>
    <v-progress-linear v-if="loading" color="primary" indeterminate :aria-label="t('Loading data...')" class="mb-4" />
    <v-row>
      <v-col cols="12" sm="6"><v-select v-model="instance" :items="instances" :label="t('Instance')" variant="outlined" hide-details :disabled="loading || saving" /></v-col>
      <v-col cols="12" sm="6"><v-select v-model="profileId" :items="profiles" item-title="name" item-value="id" :label="t('Quality profile')" variant="outlined" hide-details :disabled="loading || saving" /></v-col>
      <v-col cols="12"><v-select v-model="rootFolder" :items="folders" :label="t('Root folder')" variant="outlined" hide-details :disabled="loading || saving" /></v-col>
    </v-row>
    <p class="text-caption text-medium-emphasis mt-3 mb-5">{{ t('Existing media keep their quality profile and folder. Only requested seasons are added to monitoring.') }}</p>
    <v-textarea v-model="reason" :label="t('Refusal reason (optional)')" maxlength="1000" variant="outlined" rows="2" :disabled="saving" />
    <template #actions>
      <v-btn color="error" variant="outlined" :disabled="saving || loading || attempted" @click="decide('reject')">{{ t('Refuse') }}</v-btn>
      <v-btn color="primary" variant="outlined" :loading="saving" :disabled="saving || loading || attempted || !instance || !profileId || !rootFolder" @click="decide('approve')">{{ t('Approve request') }}</v-btn>
    </template>
  </DialogSheet>
</template>
