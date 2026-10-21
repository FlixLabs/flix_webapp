<script setup lang="ts">
import { t } from '@/i18n';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useFlixStore } from '@/stores/flixStore';
import { mediaQuery } from '@/composables/mediaLinks';
import type { MediaType } from '@/composables/useMediaService';
import { useDialogActivator } from '@/composables/useDialogActivator';

const props = defineProps<{ mediaId: number; type: MediaType }>();
const router = useRouter(); const store = useFlixStore();
const dialog = ref(false); const copied = ref(false); const error = ref('');
let copyGeneration = 0;
watch(dialog, () => { copyGeneration++; }, { flush: 'sync' });
const dialogActivator = useDialogActivator(() => dialog.value);
const link = computed(() => new URL(router.resolve({ path: '/library', query: mediaQuery(props.type, props.mediaId, import.meta.env.VITE_FLIX_API_USE === 'true' ? store.selectedInstance : null) }).href, window.location.origin).href);
async function copy() {
  if (!dialog.value) return;
  const current = ++copyGeneration;
  copied.value = false; error.value = '';
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(link.value);
    if (current === copyGeneration && dialog.value) copied.value = true;
  } catch {
    if (current === copyGeneration && dialog.value) error.value = 'Automatic copying is unavailable. Select the link to copy it manually.';
  }
}
</script>

<template>
  <v-btn icon="mdi-link-variant" variant="text" size="small" :aria-label="t('Share media')" @click="dialog = true; copied = false; error = ''" />
  <v-dialog v-model="dialog" :activator="dialogActivator" :open-on-click="false" :aria-label="t('Share media link')" max-width="600">
    <v-card>
      <v-card-title>{{ t("Share media link") }}</v-card-title>
      <v-card-text>
        <v-text-field :label="t('Media link')" :model-value="link" readonly variant="outlined" hide-details @click="($event.target as HTMLInputElement)?.select?.()" />
        <v-alert v-if="copied" type="success" variant="tonal" class="mt-3">{{ t("Link copied.") }}</v-alert>
        <v-alert v-if="error" type="info" variant="tonal" class="mt-3">{{ t(error) }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="copy">{{ t("Copy link") }}</v-btn>
        <v-spacer /><v-btn color="on-surface" @click="dialog = false">{{ t("Close") }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
