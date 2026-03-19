<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

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

const dialogCardEl = ref<HTMLElement | null>(null);
const dialogScrollEl = ref<HTMLElement | null>(null);
const showScrollHint = ref(false);
let contentObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;

function resolveElement(el: any): HTMLElement | null {
  if (!el) {
    return null;
  }
  if (el instanceof HTMLElement) {
    return el;
  }
  if (el.$el instanceof HTMLElement) {
    return el.$el;
  }
  return null;
}

function setDialogCardRef(el: any) {
  dialogCardEl.value = resolveElement(el);
}

function setDialogScrollRef(el: any) {
  dialogScrollEl.value = resolveElement(el);
}

function getScrollTarget() {
  const candidates = [dialogScrollEl.value, dialogCardEl.value].filter(Boolean) as HTMLElement[];

  return candidates.find(el => (el.scrollHeight - el.clientHeight) > 8) ?? null;
}

function attachContentObserver() {
  if (!contentObserver) {
    return;
  }

  contentObserver.disconnect();

  const targets = [dialogScrollEl.value, dialogCardEl.value].filter(Boolean) as HTMLElement[];

  for (const target of targets) {
    contentObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

function attachResizeObserver() {
  if (!resizeObserver) {
    return;
  }

  resizeObserver.disconnect();

  const targets = [dialogScrollEl.value, dialogCardEl.value].filter(Boolean) as HTMLElement[];
  for (const target of targets) {
    resizeObserver.observe(target);
  }
}

function updateScrollHint() {
  const el = getScrollTarget();
  if (!el) {
    showScrollHint.value = false;
    return;
  }

  const canScroll = el.scrollHeight - el.clientHeight > 8;
  const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  showScrollHint.value = canScroll && !isAtBottom;
}

function refreshScrollHint() {
  nextTick(() => {
    attachContentObserver();
    attachResizeObserver();
    requestAnimationFrame(updateScrollHint);
  });
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    refreshScrollHint();
  }
});

watch(() => props.item, () => {
  if (props.modelValue) {
    refreshScrollHint();
  }
});

onMounted(() => {
  refreshScrollHint();
  window.addEventListener('resize', updateScrollHint);

  contentObserver = new MutationObserver(() => {
    updateScrollHint();
  });
  attachContentObserver();

  resizeObserver = new ResizeObserver(() => {
    updateScrollHint();
  });
  attachResizeObserver();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScrollHint);
  contentObserver?.disconnect();
  contentObserver = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    max-width="980px"
    max-height="815px"
    class="blur-dialog"
    >
    <v-card
      :ref="setDialogCardRef"
      class="dialog-flex"
      @scroll.passive="updateScrollHint"
      >
      <v-card-title>
        {{ mediaType }}
      </v-card-title>
      <v-card-text
        :ref="setDialogScrollRef"
        class="dialog-flex-text"
        @scroll.passive="updateScrollHint"
        >
        <v-row>
          <v-col>
            <v-card>
              <v-img
                :src="item.prependAvatar ?? item.poster"
                class="media-poster"
                :aspect-ratio="2 / 3"
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
                <v-row no-gutters>
                  <v-col class="meta-label">
                    Certification
                  </v-col>
                </v-row>
                <v-row no-gutters>
                  <v-col class="meta-value">
                    {{ item.certification }}
                  </v-col>
                </v-row>
              </v-col>
              <v-col>
                <v-row no-gutters>
                  <v-col class="meta-label">
                    Year
                  </v-col>
                </v-row>
                <v-row no-gutters>
                  <v-col class="meta-value">
                    {{ item.year }}
                  </v-col>
                </v-row>
              </v-col>
              <v-col>
                <v-row no-gutters>
                  <v-col class="meta-label">
                    Runtime
                  </v-col>
                </v-row>
                <v-row no-gutters>
                  <v-col class="meta-value">
                    {{ item.runTime }}
                  </v-col>
                </v-row>
              </v-col>
            </v-row>
            <v-row>
              <v-col>
                {{ item.overview }}
              </v-col>
            </v-row>
          </v-col>
        </v-row>
        <slot
          name="details"
          />
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
        <div
          v-if="showScrollHint"
          class="scroll-hint"
          >
          <v-icon
            size="16"
            >
            mdi-chevron-double-down
          </v-icon>
          <span>Scroll</span>
        </div>
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

.media-poster {
  width: 100%;
}

.meta-label {
  font-size: 0.8rem;
  opacity: 0.8;
}

.meta-value {
  margin-top: 2px;
  line-height: 1.2;
}

.dialog-flex {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.dialog-flex-text {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}

.scroll-hint {
  position: absolute;
  right: 12px;
  bottom: 7px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.75);
  background: rgba(var(--v-theme-surface), 0.9);
  pointer-events: none;
}

.blur-dialog {
  backdrop-filter: blur(5px);
}
</style>
