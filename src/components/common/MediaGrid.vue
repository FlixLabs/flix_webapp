<script setup lang="ts">
import MediaImage from './MediaImage.vue';

const props = defineProps<{
  paginated_items: any | null;
  idField: 'id' | 'tmdbId';
  announcementName: 'Release' | 'Premiere';
  showAnnouncement?: boolean;
  showHasFile: boolean;
  selectionMode?: boolean;
  selectedIds?: number[];
  selectionDisabled?: boolean;
}>();

const emit = defineEmits(['card-click', 'toggle-selection']);

function cardClick(id: number) {
  if (props.selectionMode) {
    if (!props.selectionDisabled) emit('toggle-selection', id);
  } else emit('card-click', id);
}

function keyboardOpen(event: KeyboardEvent, id: number) {
  if (!event.repeat && !props.selectionMode) cardClick(id);
}
</script>

<template>
  <v-row
    v-if="paginated_items.length"
    class="mt-2"
    density="compact"
    >
    <v-col
      v-for="item in paginated_items"
      :key="item[idField]"
      cols="6"
      sm="4"
      md="3"
      lg="2"
      class="mb-4"
      >
      <v-card
        class="media-card"
        :aria-label="`${selectionMode ? 'Select' : 'Open'} ${item.title}`"
        :role="selectionMode ? 'group' : 'button'"
        :tabindex="selectionMode ? undefined : 0"
        :aria-haspopup="selectionMode ? undefined : 'dialog'"
        @click="cardClick(item[idField])"
        @keydown.enter.self.prevent="keyboardOpen($event, item[idField])"
        @keydown.space.self.prevent="keyboardOpen($event, item[idField])"
        >
        <MediaImage
          :src="item.prependAvatar ?? item.poster"
          :alt="item.title"
          class="w-100"
          height="250"
          cover
          />
        <v-checkbox-btn
          v-if="selectionMode"
          class="position-absolute top-0 right-0 bg-surface rounded ma-2"
          :aria-label="`Select ${item.title}`"
          :model-value="selectedIds?.includes(item[idField]) || false"
          :disabled="selectionDisabled || !Number.isInteger(item[idField]) || item[idField] <= 0"
          color="primary"
          @click.stop
          @update:model-value="emit('toggle-selection', item[idField])"
        />
        <v-card-title
          class="title-line text-center text-wrap"
          :title="item.title"
          >
          <span class="title-text">{{ item.title }}</span>
        </v-card-title>
        <v-card-text
          class="media-date text-center d-flex align-center justify-center"
          >
          {{ showAnnouncement
            ? `${announcementName} ${item.release_date || item.year || ''}`
            : item.year || `${announcementName} ${item.release_date ?? ''}` }}
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
  min-height: 3.4rem;
  height: 3.4rem;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.title-text {
  width: 100%;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: break-word;
}

.media-date {
  height: 56px;
}
</style>
