<script setup lang="ts">

import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  }
});

const emits = defineEmits(['update:modelValue', 'cancel', 'confirm']);

const internalVisible = ref(props.modelValue);

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
    max-width="600px"
    >
    <v-card>
      <v-card-title>
        Confirm deletion
      </v-card-title>
      <v-card-text>
        Are you sure you want to delete this item? This action cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-btn
          @click="cancel"
          color="secondary"
          >
          Cancel
        </v-btn>
        <v-btn
          @click="confirm"
          color="primary"
          >
          Confirm
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
