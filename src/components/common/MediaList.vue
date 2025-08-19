<script setup lang="ts">

const props = defineProps<{
  mediaType: 'movies' | 'series';
  paginated_items: any | null;
  qualityItems: any | null;
}>();

const emit = defineEmits(['add', 'remove']);
</script>

<template>
  <v-list
    v-if="paginated_items.length"
    class="custom-list mt-4 pa-0"
    >
    <v-list-item
      v-for="(item, index) in paginated_items"
      :key="index"
      link
      class="pa-0 spacing-list-item"
      >
      <template
        v-slot:prepend
        >
        <v-avatar
          class="custom-avatar"
          >
          <v-img
            :src="item.prependAvatar"
            alt="Poster"
            class="custom-img"
            />
        </v-avatar>
      </template>
      <v-list-item-content>
        <v-list-item-title>
          {{ item.title }} ({{ item.year }})
        </v-list-item-title>
        <v-tooltip
          :text="item.overview"
          >
          <template #activator="{ props }">
            <span v-bind="props" style="cursor:pointer;">
              <p
                class="truncate-overview"
                >
                {{ item.overview }}
              </p>
            </span>
          </template>
        </v-tooltip>
        <v-row
          class="mt-4"
          >
          <v-col
            v-if="$vuetify.display.smAndUp"
            >
            <v-select
              v-model="item.selected_quality"
              :items="qualityItems"
              label="Quality"
              variant="outlined"
              :disabled="item.already_in_library"
              />
          </v-col>
          <v-col>
            <v-btn
              v-if="!item.already_in_library && qualityItems.length"
              color="primary"
              variant="outlined"
              @click="emit('add', mediaType, item)"
              block
              style="height: 56px"
              >
              Add
            </v-btn>
            <v-btn
              v-if="!item.already_in_library && !qualityItems.length"
              color="primary"
              variant="outlined"
              @click="emit('add', mediaType, item)"
              block
              style="height: 56px"
              disabled
              >
              Add
            </v-btn>
            <v-btn
              v-if="item.already_in_library"
              color="error"
              variant="outlined"
              @click="emit('remove', mediaType, item)"
              block
              style="height: 56px"
              >
              Remove
            </v-btn>
          </v-col>
        </v-row>
      </v-list-item-content>
    </v-list-item>
  </v-list>
</template>

<style scoped>
.custom-list {
  background-color: #121212 !important;
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
  color: gray;
  font-size: 0.9em;
  margin-top: 5px;
  margin-left: 15px;
}

.spacing-list-item:not(:first-child) {
  margin-top: 10px;
}

.spacing-list-item {
  border-radius: 5px !important;
}
</style>
