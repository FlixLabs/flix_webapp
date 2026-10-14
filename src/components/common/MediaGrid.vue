<script setup lang="ts">
import MediaCard from './MediaCard.vue';
import MediaBadges from './MediaBadges.vue';

defineProps<{
  paginated_items: any | null;
  idField: 'id' | 'tmdbId';
  announcementName: 'Release' | 'Premiere';
  showAnnouncement?: boolean;
  showHasFile: boolean;
  selectionMode?: boolean;
  selectedIds?: number[];
  selectionDisabled?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits(['card-click', 'toggle-selection']);
</script>

<template>
  <v-row v-if="paginated_items.length" class="mt-2" density="compact">
    <v-col v-for="item in paginated_items" :key="item[idField]" cols="6" sm="4" md="3" lg="2" class="mb-4">
      <MediaCard :title="item.title" :poster="item.prependAvatar ?? item.poster" :poster-height="250" :subtitle="showAnnouncement ? `${announcementName} ${item.release_date || item.year || ''}` : item.year || `${announcementName} ${item.release_date ?? ''}`" :disabled="disabled" :selection-mode="selectionMode" :selected="selectedIds?.includes(item[idField])" :selection-disabled="selectionDisabled || !Number.isInteger(item[idField]) || item[idField] <= 0" @open="emit('card-click', item[idField])" @select="emit('toggle-selection', item[idField])">
        <MediaBadges :has-file="item.hasFile" :status="item.status" :show-has-file="showHasFile" />
      </MediaCard>
    </v-col>
  </v-row>
</template>
