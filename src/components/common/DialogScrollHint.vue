<script setup lang="ts">
import { t } from '@/i18n';
</script>
<template>
  <div class="scroll-hint" aria-hidden="true">
    <v-icon size="16">mdi-chevron-double-down</v-icon>
    <span>{{ t("Scroll") }}</span>
  </div>
</template>

<style scoped>
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
</style>
