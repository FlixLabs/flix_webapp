<script setup lang="ts">
import { computed } from 'vue';
import { t, formatNumber } from '@/i18n';
import type { MediaBadge } from '@/composables/mediaBadges';
const props = defineProps<{ badge: MediaBadge }>();
const label = computed(() => {
  const match = /^(\d+) (.+)$/.exec(props.badge.label);
  return match ? `${formatNumber(Number(match[1]))} ${t(match[2])}` : t(props.badge.label);
});
</script>

<template>
  <v-chip size="small" :color="badge.color" :title="label"><span class="text-truncate">{{ label }}</span></v-chip>
</template>
