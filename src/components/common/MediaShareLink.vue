<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useFlixStore } from '@/stores/flixStore';
import { mediaQuery } from '@/composables/mediaLinks';
import type { MediaType } from '@/composables/useMediaService';

const props = defineProps<{ mediaId: number; type: MediaType }>();
const router = useRouter(); const store = useFlixStore();
const dialog = ref(false); const copied = ref(false); const error = ref('');
const link = computed(() => new URL(router.resolve({ path: '/library', query: mediaQuery(props.type, props.mediaId, import.meta.env.VITE_FLIX_API_USE === 'true' ? store.selectedInstance : null) }).href, window.location.origin).href);
async function copy() {
  copied.value = false; error.value = '';
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(link.value); copied.value = true;
  } catch { error.value = 'Automatic copying is unavailable. Select the link to copy it manually.'; }
}
</script>

<template>
  <v-btn icon="mdi-link-variant" variant="text" size="small" aria-label="Share media" @click="dialog = true; copied = false; error = ''" />
  <v-dialog v-model="dialog" max-width="600">
    <v-card>
      <v-card-title>Share media link</v-card-title>
      <v-card-text>
        <v-text-field label="Media link" :model-value="link" readonly variant="outlined" hide-details @click="($event.target as HTMLInputElement)?.select?.()" />
        <v-alert v-if="copied" type="success" variant="tonal" class="mt-3">Link copied.</v-alert>
        <v-alert v-if="error" type="info" variant="tonal" class="mt-3">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="copy">Copy link</v-btn>
        <v-spacer /><v-btn @click="dialog = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
