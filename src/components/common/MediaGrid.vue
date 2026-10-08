<script setup lang="ts">

const props = defineProps<{
  paginated_items: any | null;
  idField: 'id' | 'tmdbId';
  announcementName: 'Release' | 'Premiere';
  showHasFile: boolean;
}>();

const emit = defineEmits(['card-click']);
</script>

<template>
  <v-row
    v-if="paginated_items.length"
    class="mt-2"
    density="compact"
    >
    <v-col
      v-for="(item, index) in paginated_items"
      :key="index"
      cols="6"
      sm="4"
      md="3"
      lg="2"
      class="mb-4"
      >
      <v-card
        class="media-card"
        @click="emit('card-click', item[idField])"
        >
        <v-img
          :src="item.prependAvatar ?? item.poster"
          class="w-100"
          height="250"
          cover
          />
        <v-card-title
          class="title-line text-center"
          >
          {{ item.title }}
        </v-card-title>
        <v-card-text
          class="media-date text-center d-flex align-center justify-center"
          >
          {{ item.year || `${announcementName} ${item.release_date ?? ''}` }}
        </v-card-text>
        <div
          class="d-flex justify-center pb-2"
          >
          <v-chip
            v-if="showHasFile && item.hasFile"
            color="green"
            size="small"
            >
            Existing
          </v-chip>
          <v-chip
            v-if="showHasFile && !item.hasFile"
            color="red"
            size="small"
            >
            Missing
          </v-chip>
          <v-chip
            v-if="item.status"
            color="blue"
            size="small"
            class="ml-1"
            >
            {{ item.status.charAt(0).toUpperCase() + item.status.slice(1) }}
          </v-chip>
          <v-chip
            v-else
            color="blue"
            size="small"
            class="ml-1"
            >
            Unknown
          </v-chip>
        </div>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>
.title-line {
  font-size: 1rem;
  line-height: 1.2;
  font-weight: bold;
}

.media-date {
  height: 56px;
}
</style>
