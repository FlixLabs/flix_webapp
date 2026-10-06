<script setup lang="ts">
defineProps<{ size: number; isLoading: boolean; isOpen: boolean }>();
</script>

<template>
  <v-row v-if="isOpen && !isLoading && size > 0">
    <v-col>
      <v-text-field
        label="Size (GB)"
        variant="outlined"
        :model-value="(size / 1e9).toFixed(2)"
        disabled
      />
    </v-col>
  </v-row>
</template>
