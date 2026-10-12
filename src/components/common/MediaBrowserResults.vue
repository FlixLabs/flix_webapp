<script setup lang="ts">
import Loading from "@/components/common/Loading.vue";
import MediaGrid from "@/components/common/MediaGrid.vue";

defineProps<{
  items: Record<string, unknown>[];
  total: number;
  isLoading: boolean;
  idField: "id" | "tmdbId";
  announcementName: "Release" | "Premiere";
  showAnnouncement?: boolean;
  showHasFile: boolean;
  emptyMessage: string;
  selectionMode?: boolean;
  selectedIds?: number[];
  selectionDisabled?: boolean;
}>();
defineEmits<{ "card-click": [id: number]; 'toggle-selection': [id: number] }>();
</script>

<template>
  <Loading :isLoading="isLoading" sentence="Research in progress..." />
  <MediaGrid
    :paginated_items="items"
    :id-field="idField"
    :announcementName="announcementName"
    :show-announcement="showAnnouncement"
    :showHasFile="showHasFile"
    :selection-mode="selectionMode"
    :selected-ids="selectedIds"
    :selection-disabled="selectionDisabled"
    @toggle-selection="$emit('toggle-selection', $event)"
    @card-click="$emit('card-click', $event)"
  />
  <v-alert v-if="!total && !isLoading" type="info" class="mt-4">
    {{ emptyMessage }}
  </v-alert>
</template>
