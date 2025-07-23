<script setup lang="ts">

const props = defineProps<{
  modelValue: boolean;
  mediaType: 'Movie' | 'Serie';
  item: any | null;
  announcementName: 'Release' | 'Premiere';
  showSearch: boolean;
  showAdd: boolean;
  showRemove: boolean;
}>();

const emit = defineEmits(['update:modelValue', 'search', 'add', 'remove']);
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    max-width="600px"
    max-height="600px"
    >
    <v-card
      class="dialog-flex"
      >
      <v-card-title>
        {{ mediaType }}
      </v-card-title>
      <v-card-text
        class="dialog-flex-text"
        >
        <v-row>
          <v-col>
            <v-card>
              <v-img
                :src="item.prependAvatar ?? item.poster"
                class="w-100"
                cover
                />
            </v-card>
          </v-col>
          <v-col>
            <v-row
              class="title-line text-center"
              >
              <v-col>
                {{ item.title }}
              </v-col>
            </v-row>
            <v-row
              v-if="!item.year"
              class="text-center"
              >
              <v-col>
                {{ announcementName }} {{ item.release_date }}
              </v-col>
            </v-row>
            <v-row
              v-else
              class="text-center"
              >
              <v-col>
                {{ item.certification }}
              </v-col>
              <v-col>
                {{ item.year }}
              </v-col>
              <v-col>
                {{ item.runTime }}
              </v-col>
            </v-row>
            <v-row>
              <v-col>
                {{ item.overview }}
              </v-col>
            </v-row>
          </v-col>
        </v-row>
        <v-row
          v-if="item.relativePath"
          >
          <v-col>
            <v-row>
              <v-col>
                <v-tooltip
                  :text="item.relativePath"
                  >
                  <template
                    #activator="{ props }"
                    >
                    <span
                      v-bind="props"
                      style="cursor:pointer;"
                      >
                      <v-text-field
                        label="File"
                        variant="outlined"
                        v-model="item.relativePath"
                        :disabled="true"
                        />
                    </span>
                  </template>
                </v-tooltip>
              </v-col>
            </v-row>
            <v-row
              class="mt-0"
              >
              <v-col>
                <v-text-field
                  label="Size (GB)"
                  variant="outlined"
                  :model-value="(item.statistics.sizeOnDisk / 1e9).toFixed(2)"
                  :disabled="true"
                  />
              </v-col>
              <v-col>
                <v-text-field
                  label="Quality"
                  variant="outlined"
                  :model-value="item.quality"
                  :disabled="true"
                  />
              </v-col>
            </v-row>
          </v-col>
        </v-row>
        <slot
          name="episodes"
          />
      </v-card-text>
      <v-card-actions>
        <v-btn
          v-if="showSearch"
          @click="emit('search', item)"
          color="primary"
          >
          Search
        </v-btn>
        <v-btn
          v-if="showAdd"
          @click="emit('add', item)"
          color="primary"
          >
          Add
        </v-btn>
        <v-btn
          v-if="showRemove"
          @click="emit('remove', item)"
          color="error"
          >
          Remove
        </v-btn>
        <v-btn
          @click="$emit('update:modelValue', false)"
          color="secondary"
          >
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.title-line {
  font-size: 1rem;
  line-height: 1.2;
  font-weight: bold;
}

.dialog-flex {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.dialog-flex-text {
  flex: 1;
  overflow-y: auto;
}
</style>
