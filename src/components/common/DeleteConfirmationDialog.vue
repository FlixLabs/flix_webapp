<script setup lang="ts">

import { ref, watch } from 'vue';
import { useDialogActivator } from '@/composables/useDialogActivator';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  message?: string;
}>(), {
  message: 'Are you sure you want to delete this item? This action cannot be undone.',
});

const emits = defineEmits(['update:modelValue', 'cancel', 'confirm']);

const internalVisible = ref(props.modelValue);
const dialogActivator = useDialogActivator(() => internalVisible.value);
const cancelButton = ref<{ $el: HTMLElement } | null>(null);

watch(() => props.modelValue, (newVal) => {
  internalVisible.value = newVal;
});

watch(internalVisible, (newVal) => {
  emits('update:modelValue', newVal);
});

function cancel() {
  emits('cancel');
  internalVisible.value = false;
}

function confirm() {
  emits('confirm');
  internalVisible.value = false;
}
</script>

<template>
  <v-dialog
    v-model="internalVisible"
    :activator="dialogActivator"
    :open-on-click="false"
    aria-label="Confirm deletion"
    @after-enter="cancelButton?.$el.focus({ preventScroll: true })"
    max-width="600px"
    class="blur-dialog"
    >
    <v-card>
      <v-card-title>
        Confirm deletion
      </v-card-title>
      <v-card-text>
        {{ message }}
      </v-card-text>
      <v-card-actions>
        <v-btn
          ref="cancelButton"
          @click="cancel"
          color="on-surface"
          >
          Cancel
        </v-btn>
        <v-btn
          @click="confirm"
          color="error"
          >
          Confirm
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
