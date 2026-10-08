<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import PageNavigation from './PageNavigation.vue';

const selected = defineModel<string>({ required: true });
const props = defineProps<{ sections: { title: string; value: string; icon: string }[] }>();
const { xs } = useDisplay();
const rows = computed(() => xs.value
  ? Array.from({ length: Math.ceil(props.sections.length / 2) }, (_, index) => props.sections.slice(index * 2, index * 2 + 2))
  : [props.sections]);
const navigation = ref<InstanceType<typeof PageNavigation> | null>(null);
watch(selected, async () => {
  await nextTick();
  navigation.value?.scrollToStart();
});
</script>

<template>
  <PageNavigation ref="navigation">
    <div class="d-flex flex-wrap align-center ga-3">
      <slot />
      <div class="d-flex flex-wrap ga-3" :class="{ 'w-100': xs }">
        <v-btn-toggle v-for="row in rows" :key="row[0]?.value" v-model="selected" mandatory color="primary" variant="outlined" class="flex-shrink-0" :class="{ 'w-100': xs }" aria-label="Page sections">
          <v-btn v-for="section in row" :key="section.value" :value="section.value" :prepend-icon="section.icon" :class="{ 'flex-grow-1': xs }">{{ section.title }}</v-btn>
        </v-btn-toggle>
      </div>
    </div>
  </PageNavigation>
</template>
