<script setup lang="ts">
import { useDialogActivator, preserveNestedDialogFocus } from '@/composables/useDialogActivator';
import { useDialogScroll } from '@/composables/useDialogScroll';
import DialogScrollHint from './DialogScrollHint.vue';

const props = withDefaults(defineProps<{ modelValue: boolean; title: string; label: string; context?: unknown; activator?: HTMLElement | null; closeLabel?: string }>(), { closeLabel: 'Close' });
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; closed: [] }>();
const fallbackActivator = useDialogActivator(() => props.modelValue);
const scroll = useDialogScroll(() => props.modelValue, () => props.context);
const { element, canScroll, showScrollHint, setElement, update, refresh } = scroll;
function entered() { refresh(); preserveNestedDialogFocus(element.value); }
</script>

<template>
  <v-dialog :model-value="modelValue" :activator="activator ?? fallbackActivator" :open-on-click="false" :aria-label="label" max-width="980" max-height="min(815px, calc(100% - 48px))" scrollable class="blur-dialog" transition="fade-transition" @update:model-value="emit('update:modelValue', $event)" @after-enter="entered" @after-leave="emit('closed')">
    <v-card class="dialog-flex">
      <v-card-title class="d-flex align-center ga-2"><span>{{ title }}</span><v-spacer /><slot name="header-actions" /></v-card-title>
      <div class="dialog-body">
        <v-card-text :ref="setElement" class="dialog-flex-text" :class="{ 'dialog-no-overflow': !canScroll }" @scroll.passive="update">
          <slot :showScrollHint="showScrollHint" :canScroll="canScroll" />
        </v-card-text>
        <DialogScrollHint v-if="showScrollHint" />
      </div>
      <v-card-actions class="dialog-actions flex-wrap">
        <div v-if="$slots.navigation" class="dialog-navigation"><slot name="navigation" /></div>
        <slot name="actions" />
        <v-btn color="secondary" :aria-label="closeLabel" @click="emit('update:modelValue', false)">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-navigation { margin-inline-end: auto; min-width: 0; }
</style>
