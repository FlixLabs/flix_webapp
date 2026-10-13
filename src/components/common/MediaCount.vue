<script setup lang="ts">
defineProps<{ total?: number; pending?: boolean }>();
</script>

<template>
  <span v-if="pending || total !== undefined" class="ml-1" :aria-busy="pending || undefined">({{ pending ? '...' : total }})</span>
</template>
