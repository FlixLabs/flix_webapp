<script setup lang="ts">
import MediaImage from './MediaImage.vue';
import ReleaseSelectionDialog from './ReleaseSelectionDialog.vue';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  mediaType: 'Movie' | 'Serie';
  item: any | null;
  announcementName: 'Release' | 'Premiere';
  showSearch: boolean;
  showAdd: boolean;
  showRemove: boolean;
  actionPending?: boolean;
  addDisabled?: boolean;
  showFileDetails?: boolean;
  activator?: HTMLElement | null;
}>(), {
  showFileDetails: true,
});

const emit = defineEmits(['update:modelValue', 'search', 'add', 'remove', 'release-grabbed']);
const releaseDialog = ref(false);
watch(() => props.modelValue, value => { if (!value) releaseDialog.value = false; });

function releaseGrabbed() {
  releaseDialog.value = false;
  emit('release-grabbed');
  emit('update:modelValue', false);
}

const dialogScrollEl = ref<HTMLElement | null>(null);
const showScrollHint = ref(false);
const concealFileDetails = ref(false);
let contentObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let scrollFrame = 0;

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

function setDialogScrollRef(el: any) {
  dialogScrollEl.value = resolveElement(el);
}

function getScrollTarget() {
  return dialogScrollEl.value;
}

function attachContentObserver() {
  if (!contentObserver) {
    return;
  }

  contentObserver.disconnect();

  const targets = [dialogScrollEl.value].filter(Boolean) as HTMLElement[];

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

  const targets = [dialogScrollEl.value, ...(dialogScrollEl.value?.children ?? [])].filter(Boolean) as Element[];
  for (const target of targets) {
    resizeObserver.observe(target);
  }
}

function updateScrollHint() {
  const el = getScrollTarget();
  if (!el) {
    showScrollHint.value = false;
    concealFileDetails.value = false;
    return;
  }

  const canScroll = el.scrollHeight - el.clientHeight > 8;
  showScrollHint.value = canScroll && el.scrollTop <= 0;
  concealFileDetails.value = showScrollHint.value;
}

function scheduleScrollHint() {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(updateScrollHint);
}

function refreshScrollHint() {
  nextTick(() => {
    attachContentObserver();
    attachResizeObserver();
    scheduleScrollHint();
  });
}

function resetScroll() {
  if (dialogScrollEl.value) dialogScrollEl.value.scrollTop = 0;
  refreshScrollHint();
}

watch(dialogScrollEl, refreshScrollHint, { flush: 'post' });

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    nextTick(resetScroll);
  }
});

watch(() => props.item, () => {
  if (props.modelValue) {
    nextTick(resetScroll);
  }
});

onMounted(() => {
  refreshScrollHint();
  window.addEventListener('resize', scheduleScrollHint);

  contentObserver = new MutationObserver(() => {
    attachResizeObserver();
    scheduleScrollHint();
  });
  attachContentObserver();

  resizeObserver = new ResizeObserver(() => {
    scheduleScrollHint();
  });
  attachResizeObserver();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleScrollHint);
  cancelAnimationFrame(scrollFrame);
  contentObserver?.disconnect();
  contentObserver = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <v-dialog
    :activator="activator ?? undefined"
    :open-on-click="activator ? false : undefined"
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    max-width="980px"
    max-height="min(815px, calc(100% - 48px))"
    scrollable
    @after-enter="refreshScrollHint"
    class="blur-dialog"
    transition="fade-transition"
    >
    <v-card
      class="dialog-flex"
      >
      <v-card-title>
        {{ mediaType }}
      </v-card-title>
      <div class="dialog-body">
        <v-card-text
        :ref="setDialogScrollRef"
        class="dialog-flex-text"
        @scroll.passive="updateScrollHint"
        >
        <v-row>
          <v-col>
            <v-card>
              <MediaImage
                :src="item.prependAvatar ?? item.poster"
                :alt="item.title"
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
                    {{ item.certification || 'Unavailable' }}
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
                    {{ item.runTime || 'Unavailable' }}
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
        <div
          class="media-supplemental-details"
          :class="{ 'media-details-concealed': showFileDetails && concealFileDetails }"
          >
          <slot name="details" />
        <v-row
          v-if="showFileDetails !== false && item.relativePath"
          class="media-file-details"
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
                  :model-value="item.statistics?.sizeOnDisk != null ? (item.statistics.sizeOnDisk / 1e9).toFixed(2) : 'Unavailable'"
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
          <slot name="episodes" />
        </div>
        </v-card-text>
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
      </div>
      <v-card-actions class="flex-wrap">
        <v-btn v-if="showSearch" color="primary" @click="releaseDialog = true">Choose Release</v-btn>
        <v-btn
          v-if="showSearch"
          @click="emit('search', item)"
          color="primary"
          >
          {{ item.hasFile || item.statistics?.sizeOnDisk > 0 ? 'Search Again' : 'Search' }}
        </v-btn>
        <v-btn
          v-if="showAdd"
          :loading="actionPending"
          :disabled="actionPending || addDisabled"
          @click="emit('add', item)"
          color="primary"
          >
          Add
        </v-btn>
        <v-btn
          v-if="showRemove"
          :loading="actionPending"
          :disabled="actionPending"
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
  <ReleaseSelectionDialog
    v-model="releaseDialog"
    :media-type="mediaType === 'Movie' ? 'movies' : 'series'"
    :item="item"
    @grabbed="releaseGrabbed"
  />
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
  min-height: 0;
  overflow: hidden;
}

.dialog-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.dialog-flex-text {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  font-size: inherit;
  letter-spacing: 0.03125em;
  line-height: inherit;
  padding: 16px 24px 24px;
}

.media-supplemental-details {
  display: flow-root;
  padding-top: 24px;
}

.media-details-concealed {
  visibility: hidden;
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
