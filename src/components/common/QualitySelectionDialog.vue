<script setup lang="ts">

import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  items: [] | null;
  selectedValue?: any | null;
}>();

const emits = defineEmits(['update:modelValue', 'cancel', 'confirm']);

const internalVisible = ref(props.modelValue);

const selected = ref<any>(null);

watch(() => props.modelValue, (newVal) => {
  internalVisible.value = newVal;
});

watch(internalVisible, (newVal) => {
  emits('update:modelValue', newVal);

  if (!newVal) {
    selected.value = null;
  }
});

watch(() => props.selectedValue, (v) => {
  selected.value = v ?? null;
}, {
  immediate: true
});

function cancel() {
  emits('cancel');
  internalVisible.value = false;
}

function confirm() {
  emits('confirm', selected.value);
  internalVisible.value = false;
}
</script>

<template>
  <v-dialog
    v-model="internalVisible"
    max-width="600px"
    class="blur-dialog"
    >
    <v-card>
      <v-card-title>
        Choose quality
      </v-card-title>
      <v-card-text>
        <v-select
          v-model="selected"
          :items="items"
          label="Quality"
          variant="outlined"
          />
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

<style scoped>
.blur-dialog {
  backdrop-filter: blur(5px);
}
</style>
