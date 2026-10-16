<script setup lang="ts">
import { t } from '@/i18n';
import type { MediaType } from '@/composables/useMediaService';
import { computed } from 'vue';
import MediaCount from './MediaCount.vue';

const selectedView = defineModel<MediaType>({ required: true });
const props = defineProps<{ totalMovies?: number; totalSeries?: number; totalCollections?: number; moviesPending?: boolean; seriesPending?: boolean; showCollections?: boolean; collections?: boolean; collectionsDisabled?: boolean }>();
const emit = defineEmits<{ collections: []; media: [type: MediaType] }>();
const activeView = computed({
  get: () => props.collections ? 'collections' : selectedView.value,
  set: (value: string) => {
    if (value === 'movies' || value === 'series') selectedView.value = value;
  },
});
function select(type: MediaType | 'collections') {
  if (type === 'collections') emit('collections');
  else { selectedView.value = type; emit('media', type); }
}
</script>

<template>
  <v-btn-toggle v-model="activeView" color="primary" variant="outlined" :size="showCollections && $vuetify.display.xs ? 'default' : undefined" mandatory class="media-type-toggle flex-shrink-0" :class="{ 'w-100': showCollections && $vuetify.display.xs }" :aria-label="t('Media type')">
    <v-btn value="movies" prepend-icon="mdi-movie-open-outline" :stacked="showCollections && $vuetify.display.xs" @click="select('movies')"> {{ t("Movies") }}<MediaCount :total="totalMovies" :pending="moviesPending" />
    </v-btn>
    <v-btn value="series" prepend-icon="mdi-television-classic" :stacked="showCollections && $vuetify.display.xs" @click="select('series')"> {{ t("Series") }}<MediaCount :total="totalSeries" :pending="seriesPending" />
    </v-btn>
    <v-btn v-if="showCollections" value="collections" prepend-icon="mdi-filmstrip-box-multiple" :stacked="$vuetify.display.xs" :disabled="collectionsDisabled" @click="select('collections')"> {{ t("Collections") }}<MediaCount :total="totalCollections" :pending="totalCollections === undefined" />
    </v-btn>
  </v-btn-toggle>
</template>

<style scoped>
.media-type-toggle.w-100 :deep(.v-btn) { flex: 1; min-width: 0; padding-inline: 8px; }
.media-type-toggle.w-100 :deep(.v-btn__content) { flex-direction: column; }
.media-type-toggle.w-100 :deep(.v-btn__content .ml-1) { margin-inline-start: 0 !important; }
</style>
