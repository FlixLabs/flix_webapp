<script setup lang="ts">
import Loading from "@/components/common/Loading.vue";
import MediaGrid from "@/components/common/MediaGrid.vue";

const page = defineModel<number>("page", { required: true });
defineProps<{
  items: Record<string, unknown>[];
  total: number;
  totalPages: number;
  isLoading: boolean;
  idField: "id" | "tmdbId";
  announcementName: "Release" | "Premiere";
  showHasFile: boolean;
  emptyMessage: string;
}>();
defineEmits<{ "card-click": [id: number] }>();
</script>

<template>
  <Loading :isLoading="isLoading" sentence="Research in progress..." />
  <MediaGrid
    :paginated_items="items"
    :id-field="idField"
    :announcementName="announcementName"
    :showHasFile="showHasFile"
    @card-click="$emit('card-click', $event)"
  />
  <v-alert v-if="!total && !isLoading" type="info" class="mt-4">
    {{ emptyMessage }}
  </v-alert>
  <v-pagination v-if="total > 0" v-model="page" :length="totalPages" rounded />
</template>
