<script setup lang="ts">
import { defaultLibraryFilters, type LibraryFilters } from '@/composables/useLibraryFilters';
const model = defineModel<LibraryFilters>({ required: true });
defineProps<{ statuses: string[]; qualities: string[]; years: number[] }>();
const availability = [{ title: 'All', value: 'all' }, { title: 'Existing', value: 'existing' }, { title: 'Missing', value: 'missing' }];
const sorting = [{ title: 'Title', value: 'title' }, { title: 'Date added', value: 'added' }, { title: 'Size', value: 'size' }, { title: 'Year', value: 'year' }];
</script>
<template>
  <v-expansion-panels class="mt-4">
    <v-expansion-panel title="Filters and sorting">
      <v-expansion-panel-text>
        <v-row>
          <v-col cols="12" sm="6" md="4"><v-select v-model="model.availability" :items="availability" label="Availability" variant="outlined" hide-details /></v-col>
          <v-col cols="12" sm="6" md="4"><v-select v-model="model.status" :items="statuses" label="Status" variant="outlined" clearable hide-details /></v-col>
          <v-col v-if="qualities.length" cols="12" sm="6" md="4"><v-select v-model="model.quality" :items="qualities" label="Quality" variant="outlined" clearable hide-details /></v-col>
          <v-col cols="12" sm="6" md="4"><v-select v-model="model.year" :items="years" label="Year" variant="outlined" clearable hide-details /></v-col>
          <v-col cols="12" sm="6" md="4"><v-text-field v-model.number="model.minSizeGB" label="Minimum size (GB)" type="number" min="0" variant="outlined" clearable hide-details /></v-col>
          <v-col cols="12" sm="6" md="4"><v-select v-model="model.sort" :items="sorting" label="Sort by" variant="outlined" hide-details /></v-col>
        </v-row>
        <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-4">
          <v-switch v-model="model.descending" label="Descending" color="primary" hide-details />
          <v-btn variant="text" @click="model = defaultLibraryFilters()">Reset filters</v-btn>
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
