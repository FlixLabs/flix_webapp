<script setup lang="ts">
import { ref } from 'vue';

const anchor = ref<HTMLElement | null>(null);
defineExpose({ scrollToStart: () => anchor.value?.scrollIntoView({ block: 'start' }) });
</script>

<template>
  <div ref="anchor" class="page-navigation-anchor" />
  <div class="page-navigation">
    <v-sheet rounded="lg" border class="pa-3">
      <slot />
    </v-sheet>
  </div>
</template>

<style scoped>
.page-navigation {
  position: sticky;
  top: var(--v-layout-top, 64px);
  z-index: 2;
}

.page-navigation-anchor {
  scroll-margin-top: var(--v-layout-top, 64px);
}
</style>
