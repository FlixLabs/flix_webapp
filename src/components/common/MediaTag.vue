<script setup lang="ts">
import type { MediaBadge } from '@/composables/mediaBadges';
defineProps<{ badge: MediaBadge }>();
</script>

<template>
  <v-chip size="small" :color="badge.color" :title="badge.label"><span class="text-truncate">{{ badge.label }}</span></v-chip>
</template>
