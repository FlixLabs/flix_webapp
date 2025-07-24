<script setup lang="ts">

const props = defineProps<{
  isLoading: boolean;
  sentence: string;
}>();
</script>

<template>
  <v-row
    v-if="isLoading"
    justify="center"
    align="center"
    class="mt-4"
    >
    <v-progress-circular
      indeterminate
      color="primary"
      size="50"
      />
    <span
      class="ml-2"
      >
      {{ sentence }}
    </span>
  </v-row>
</template>
