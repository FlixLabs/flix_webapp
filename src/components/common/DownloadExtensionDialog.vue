<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue';
import { t } from '@/i18n';
import { apiFetch } from '@/composables/apiSession';
import { parseExtensionReview, type ExtensionReview } from '@/composables/downloadExtensionRepair';
import type { MediaType } from '@/composables/useMediaService';
import DialogSheet from './DialogSheet.vue';

const props = defineProps<{ instance: string | null }>();
const emit = defineEmits<{ repaired: [type: MediaType] }>();
const visible = ref(false);
const title = ref('');
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const success = ref(false);
const review = ref<ExtensionReview | null>(null);
const activator = ref<HTMLElement | null>(null);
let type: MediaType = 'movies';
let generation = 0;
let controller: AbortController | null = null;
const endpoint = (action: string) => `${import.meta.env.VITE_FLIX_API_URL}/download-clients/${encodeURIComponent(props.instance ?? '')}/extension-${action}`;
function cancel() { generation++; controller?.abort(); controller = null; }
function closed() {
  if (visible.value) return;
  review.value = null; title.value = ''; error.value = ''; success.value = false; loading.value = false;
}
const messages: Record<string, string> = {
  REPAIR_NOT_CONFIGURED: 'Extension repair requires a storage agent and an explicit Deluge downloads path mapping.',
  FILE_INSPECTION_UNAVAILABLE: 'The storage agent could not inspect the file safely. Check its version, paths and whether the target already exists.',
  FILE_FORMAT_UNSUPPORTED: 'Only a verified single Matroska file can be corrected.',
  SINGLE_FILE_REQUIRED: 'Only a verified single Matroska file can be corrected.',
  IMPORT_PROTECTED: 'An import may be active or the rejection changed. No file was renamed.',
  PATH_OUTSIDE_DOWNLOADS: 'The Deluge download path is outside downloads_root. Configure downloads_root using the path seen by Deluge, not the host path.',
  FILE_IDENTITY_CHANGED: 'The file name, size or identity changed. Check Deluge, then start a new verification.',
  FILE_EXTENSION_ALREADY_VALID: 'Deluge already reports a supported video extension. No file was renamed. Wait for Radarr/Sonarr to refresh its import status.',
  TORRENT_IDENTITY_CHANGED: 'The torrent is missing, incomplete or present in multiple clients. Check Deluge before retrying.',
  CLIENT_BUSY: 'Another operation is using this download client. Wait for it to finish, then start a new verification.',
  REVIEW_EXPIRED: 'This verification expired or was already used. Start a new verification.',
  CONFIGURATION_CHANGED: 'The instance configuration changed. Start a new verification.',
  TOO_MANY_REVIEWS: 'Too many file verifications are pending. Wait a few minutes before retrying.',
  REPAIR_VERIFICATION_UNAVAILABLE: 'Extension repair could not be verified. Check Deluge, then start a new verification.',
  RENAME_UNCERTAIN: 'The rename could not be confirmed. Check Deluge before another attempt. No automatic retry was made.',
};
const verificationFallback = 'Extension repair could not be verified. Check Deluge, then start a new verification.';
async function request(action: string, body: unknown) {
  const response = await apiFetch(endpoint(action), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: controller?.signal });
  const data = await response.json().catch(() => { throw new Error(verificationFallback); });
  if (!response.ok) throw new Error(messages[data?.code] ?? verificationFallback);
  return data;
}
async function open(mediaType: MediaType, item: { title: string; downloadId?: string }, element?: HTMLElement) {
  if (busy.value || !props.instance) return;
  cancel(); const current = generation;
  const abort = new AbortController(); controller = abort;
  type = mediaType; title.value = item.title; review.value = null; error.value = ''; success.value = false;
  activator.value = element ?? null; loading.value = true; visible.value = true;
  const timeout = setTimeout(() => abort.abort(), 60000);
  try {
    const data = parseExtensionReview(await request('review', { mediaType, downloadId: item.downloadId }));
    if (current === generation) review.value = data;
  } catch (cause) {
    if (current === generation) error.value = abort.signal.aborted
      ? 'Extension verification timed out. No file was renamed. Start a new verification.'
      : cause instanceof Error && Object.values(messages).includes(cause.message) ? cause.message : verificationFallback;
  } finally { clearTimeout(timeout); if (current === generation) loading.value = false; }
}
async function confirm() {
  if (!review.value || busy.value || loading.value) return;
  const reviewId = review.value.reviewId;
  const current = generation;
  busy.value = true; error.value = '';
  const abort = new AbortController(); controller = abort;
  const timeout = setTimeout(() => abort.abort(), 45000);
  try {
    const data = await request('repair', { reviewId });
    if (current !== generation) return;
    if (data?.status !== 'renamed') throw new Error('The rename could not be confirmed. Check Deluge before another attempt. No automatic retry was made.');
    success.value = true; emit('repaired', type);
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error && Object.values(messages).includes(cause.message)
      ? cause.message : 'The rename could not be confirmed. Check Deluge before another attempt. No automatic retry was made.';
  } finally {
    clearTimeout(timeout);
    if (current === generation) { busy.value = false; review.value = null; }
  }
}
watch(visible, value => { if (!value) cancel(); });
watch(() => props.instance, () => { cancel(); visible.value = false; busy.value = false; loading.value = false; });
onScopeDispose(cancel);
defineExpose({ open });
</script>

<template>
  <DialogSheet v-model="visible" :title="t('Correct file extension')" :label="t('Correct file extension')" :context="instance" :activator="activator" :close-disabled="busy" @closed="closed">
    <p class="text-break mb-4">{{ title }}</p>
    <v-progress-linear v-if="loading" indeterminate color="primary" :aria-label="t('Checking file format')" />
    <v-alert v-if="error" type="error" variant="tonal" role="alert">{{ t(error) }}</v-alert>
    <template v-if="review">
      <p class="mb-3">{{ t('The storage agent detected a Matroska container. This does not validate the video content.') }}</p>
      <p class="text-break">{{ t('Current filename') }}: {{ review.originalName }}</p>
      <p class="text-break mt-2">{{ t('Proposed filename') }}: {{ review.proposedName }}</p>
      <v-alert type="warning" variant="tonal" class="mt-4">{{ t('After confirmation, Deluge will rename this file and keep tracking the torrent. No import is forced and no files are deleted.') }}</v-alert>
    </template>
    <v-alert v-if="success" type="success" variant="tonal" role="status">{{ t('Filename corrected in Deluge. Radarr/Sonarr may retry automatic import on its next check. No import was forced.') }}</v-alert>
    <template #actions><v-btn v-if="review" color="primary" :loading="busy" :disabled="loading || busy" @click="confirm">{{ t('Confirm rename') }}</v-btn></template>
  </DialogSheet>
</template>
