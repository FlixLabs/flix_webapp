<script setup lang="ts">
import { t } from '@/i18n';
import MediaImage from './MediaImage.vue';
import LocalizedMedia from './LocalizedMedia.vue';

const props = defineProps<{
  mediaType: 'movies' | 'series';
  paginated_items: any | null;
  qualityItems: any | null;
  isPending?: (type: 'movies' | 'series', item: any) => boolean;
  actionsDisabled?: boolean;
}>();

const emit = defineEmits(['add', 'remove', 'details']);
</script>

<template>
  <v-list
    v-if="paginated_items.length"
    class="custom-list mt-4 pa-0"
    >
    <LocalizedMedia v-for="(item, index) in paginated_items" :key="index" :item="item" :type="mediaType" v-slot="{ media }">
    <v-list-item
      class="pa-0 spacing-list-item"
      >
      <template
        v-slot:prepend
        >
        <v-avatar
          class="custom-avatar"
          >
          <MediaImage
            :src="item.prependAvatar"
            :alt="t('Poster')"
            class="custom-img"
            />
        </v-avatar>
      </template>
      <div class="pr-4">
        <v-list-item-title>
          {{ media.title }} ({{ item.year }})
        </v-list-item-title>
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-information-outline"
          :aria-label="t('Details for {p0}', { p0: media.title })"
          @click="emit('details', mediaType, item, $event.currentTarget)"
        >{{ t("Details") }}</v-btn>
        <v-tooltip
          :text="media.overview"
          max-width="400"
          location="top"
          >
          <template #activator="{ props }">
            <span v-bind="props" style="cursor:pointer;">
              <p
                class="truncate-overview"
                >
                {{ media.overview }}
              </p>
            </span>
          </template>
        </v-tooltip>
        <v-row
          class="mt-4 mr-0"
          >
          <v-col
            v-if="$vuetify.display.smAndUp"
            >
            <v-select
              v-model="item.selected_quality"
              :items="qualityItems"
              :menu-props="{ maxWidth: 400 }"
              :label="t('Quality')"
              variant="outlined"
              :disabled="actionsDisabled || item.already_in_library || isPending?.(mediaType, item)"
              />
          </v-col>
          <v-col>
            <v-btn
              v-if="!item.already_in_library && qualityItems.length"
              :loading="isPending?.(mediaType, item)"
              :disabled="actionsDisabled || isPending?.(mediaType, item)"
              color="primary"
              variant="outlined"
              @click="emit('add', mediaType, item)"
              block
              style="height: 56px"
              >{{ t("Add") }}</v-btn>
            <v-btn
              v-if="!item.already_in_library && !qualityItems.length"
              color="primary"
              variant="outlined"
              @click="emit('add', mediaType, item)"
              block
              style="height: 56px"
              disabled
              >{{ t("Add") }}</v-btn>
            <v-btn
              v-if="item.already_in_library"
              :loading="isPending?.(mediaType, item)"
              :disabled="actionsDisabled || isPending?.(mediaType, item)"
              color="error"
              variant="outlined"
              @click="emit('remove', mediaType, item)"
              block
              style="height: 56px"
              >{{ t("Remove") }}</v-btn>
          </v-col>
        </v-row>
      </div>
    </v-list-item>
    </LocalizedMedia>
  </v-list>
</template>

<style scoped>
.custom-list {
  background: transparent;
}

.custom-avatar {
  width: 144px !important;
  height: 216px !important;
  border-radius: 5px !important;
  overflow: hidden !important;
}

.custom-img {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}

.truncate-overview {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 100%;
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-size: 0.9em;
  margin-top: 5px;
  margin-left: 15px;
}

.spacing-list-item:not(:first-child) {
  margin-top: 10px;
}

.spacing-list-item {
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.spacing-list-item :deep(.v-list-item-title) {
  white-space: normal;
  overflow-wrap: anywhere;
}

@media (max-width: 599px) {
  .custom-avatar {
    width: 96px !important;
    height: 144px !important;
  }
}
</style>
