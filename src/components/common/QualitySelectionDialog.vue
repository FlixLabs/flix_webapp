<script setup lang="ts">
import { t } from '@/i18n';

import { ref, watch } from 'vue';
import { useDialogActivator } from '@/composables/useDialogActivator';

type QualityItem = { title: string; value: any };

const props = defineProps<{
  modelValue: any;
  items: QualityItem[];
  selectedValue?: any | null;
}>();

const emits = defineEmits(['update:modelValue', 'cancel', 'confirm']);

const internalVisible = ref(props.modelValue);
const displayedItems = ref<QualityItem[]>(props.items);
watch(() => props.items, value => { if (internalVisible.value) displayedItems.value = value; });
const dialogActivator = useDialogActivator(() => internalVisible.value);

const selected = ref<any>(null);

watch(() => props.modelValue, (newVal) => {
  internalVisible.value = newVal;
});

watch(internalVisible, (newVal) => {
  emits('update:modelValue', newVal);

  if (newVal) { selected.value = props.selectedValue ?? null; displayedItems.value = props.items; }
});

watch(() => props.selectedValue, (v) => {
  if (internalVisible.value) selected.value = v ?? null;
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
    :activator="dialogActivator"
    :open-on-click="false"
    :aria-label="t('Choose quality')"
    @after-leave="!internalVisible && (selected = null)"
    max-width="600px"
    class="blur-dialog"
    >
    <v-card>
      <v-card-title>{{ t("Choose quality") }}</v-card-title>
      <v-card-text>
        <v-select
          v-model="selected"
          :items="displayedItems"
          :label="t('Quality')"
          variant="outlined"
          />
      </v-card-text>
      <v-card-actions>
        <v-btn
          @click="cancel"
          color="on-surface"
          >{{ t("Cancel") }}</v-btn>
        <v-btn
          @click="confirm"
          color="primary"
          >{{ t("Confirm") }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
