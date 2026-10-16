<script setup lang="ts">
import { formatNumber } from '@/i18n';
defineProps<{ total?: number; pending?: boolean }>();
</script>

<template>
  <span v-if="pending || total !== undefined" class="ml-1" :aria-busy="pending || undefined">({{ pending ? '...' : formatNumber(total!) }})</span>
</template>
