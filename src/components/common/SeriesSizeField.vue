<script setup lang="ts">
import { t, decimal } from '@/i18n';
defineProps<{ size: number; isLoading: boolean; isOpen: boolean }>();
</script>

<template>
  <v-row v-if="isOpen && !isLoading && size > 0">
    <v-col>
      <v-text-field
        :label="t('Size (GB)')"
        variant="outlined"
        :model-value="decimal((size / 1e9))"
        disabled
      />
    </v-col>
  </v-row>
</template>
