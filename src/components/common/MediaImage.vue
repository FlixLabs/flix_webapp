<template>
  <v-img>
    <template #placeholder>
      <div class="d-flex align-center justify-center h-100 bg-surface">
        <v-progress-circular
          indeterminate
          color="primary"
          :size="32"
          :width="3"
          aria-label="Loading image"
        />
      </div>
    </template>
    <template #error>
      <div
        class="d-flex align-center justify-center h-100 bg-surface text-medium-emphasis"
        role="img"
        aria-label="Image unavailable"
      >
        <v-icon icon="mdi-image-broken-variant" size="32" />
      </div>
    </template>
  </v-img>
</template>
