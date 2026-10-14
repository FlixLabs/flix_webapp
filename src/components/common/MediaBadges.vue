<script setup lang="ts">
import MediaTag from './MediaTag.vue';
import { availabilityBadge, statusBadge } from '@/composables/mediaBadges';

withDefaults(defineProps<{ hasFile?: unknown; status?: unknown; showHasFile?: boolean }>(), { showHasFile: true });
</script>

<template>
  <MediaTag v-if="showHasFile" :badge="availabilityBadge(hasFile)" />
  <MediaTag :badge="statusBadge(status)" />
</template>
