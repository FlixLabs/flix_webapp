<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { t, formatDate, contentLanguage, region } from '@/i18n';
import { sessionRole } from '@/composables/apiSession';
import { requestsApi, parseRequestSearch, parseRequests, parseRequestDetail, requestLanguage, requestStatus, requestColor, type RequestMedia, type RequestDetail, type MediaRequest } from '@/composables/mediaRequests';
import { useSheetRefreshSchedule } from '@/composables/useSheetRefreshSchedule';
import MediaTypeToggle from './common/MediaTypeToggle.vue';
import MediaCard from './common/MediaCard.vue';
import MediaImage from './common/MediaImage.vue';
import DialogSheet from './common/DialogSheet.vue';
import SectionNavigation from './common/SectionNavigation.vue';
import RequestReviewDialog from './common/RequestReviewDialog.vue';

const administrator = computed(() => sessionRole.value === 'admin');
const section = ref(administrator.value ? 'requests' : 'browse');
const sections = computed(() => [{ title: 'Find media', value: 'browse', icon: 'mdi-movie-search-outline' }, { title: administrator.value ? 'All requests' : 'My requests', value: 'requests', icon: 'mdi-format-list-bulleted' }]);
const type = ref<'movies' | 'series'>('movies');
const query = ref('');
const searched = ref(false);
const results = ref<RequestMedia[]>([]);
const searchPage = ref(1);
const searchPages = ref(0);
const searchLoading = ref(false);
const searchError = ref('');
const requests = ref<MediaRequest[]>([]);
const requestsPage = ref(1);
const requestsTotal = ref(0);
const requestsLoading = ref(false);
const requestsLoaded = ref(false);
const requestsError = ref('');
const review = ref<MediaRequest | null>(null);
const checking = ref('');
const selected = ref<RequestMedia | null>(null);
const detailOpen = ref(false);
const detail = ref<RequestDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const submitting = ref(false);
const scope = ref('all');
const seasons = ref<number[]>([]);
const submitted = ref(false);
const scopeSeasons = computed(() => selected.value?.type === 'movies' || scope.value === 'all' ? null : [...seasons.value].sort((a, b) => a - b));
const related = computed(() => detail.value?.requests.find(item => JSON.stringify(item.seasons) === JSON.stringify(scopeSeasons.value)));
const canSubmit = computed(() => detailOpen.value && !!detail.value && !detailLoading.value && !detailError.value && !submitting.value && !related.value?.following && !(detail.value.type === 'movies' && detail.value.availability === 'available') && (detail.value.type === 'movies' || !!detail.value.tvdbId && (scope.value === 'all' || seasons.value.length > 0)));
const seasonChoices = computed(() => detail.value?.seasons?.map(season => {
  const label = t('Season {p0}', { p0: season.number });
  return { title: !season.name || /^(season|saison)\s+\d+$/i.test(season.name.trim()) ? label : `${label} · ${season.name}`, value: season.number };
}) ?? []);

let searchController: AbortController | null = null;
async function search(page = 1) {
  searchController?.abort();
  const controller = new AbortController(); searchController = controller;
  const text = String(query.value ?? '').trim();
  if (text.length < 2) { results.value = []; searched.value = false; searchLoading.value = false; searchError.value = ''; searchPage.value = 1; searchPages.value = 0; return; }
  searchLoading.value = true; searchError.value = ''; searched.value = true;
  try {
    const data = await requestsApi(`/catalog/search?${new URLSearchParams({ type: type.value, query: text, page: String(page), language: requestLanguage() })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
    if (controller.signal.aborted) return;
    results.value = parseRequestSearch(data.results);
    searchPage.value = Number(data.page); searchPages.value = Number(data.totalPages);
  } catch (cause) { if (!controller.signal.aborted) { results.value = []; searchError.value = cause instanceof Error ? cause.message : 'Requests unavailable.'; } }
  finally { if (searchController === controller) searchLoading.value = false; }
}
let listController: AbortController | null = null;
async function loadRequests() {
  listController?.abort();
  const controller = new AbortController(); listController = controller;
  requestsLoading.value = true; requestsError.value = '';
  try {
    const data = await requestsApi(`?page=${requestsPage.value}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
    if (controller.signal.aborted) return;
    requests.value = parseRequests(data.items);
    requestsTotal.value = Number(data.total); requestsLoaded.value = true;
  } catch (cause) { if (!controller.signal.aborted) requestsError.value = cause instanceof Error ? cause.message : 'Requests unavailable.'; }
  finally { if (listController === controller) requestsLoading.value = false; }
}
let detailController: AbortController | null = null;
async function open(item: RequestMedia) {
  detailController?.abort();
  const controller = new AbortController(); detailController = controller;
  detailOpen.value = true;
  selected.value = item; detail.value = null; detailError.value = ''; detailLoading.value = true;
  scope.value = 'all'; seasons.value = []; submitted.value = false;
  try {
    const data = await requestsApi(`/catalog/${item.type}/${item.tmdbId}?language=${requestLanguage()}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
    if (controller.signal.aborted) return;
    if (data.tmdbId !== item.tmdbId || data.type !== item.type || !Array.isArray(data.requests)) throw new Error('Requests unavailable.');
    detail.value = parseRequestDetail(data);
  } catch (cause) { if (!controller.signal.aborted) detailError.value = cause instanceof Error ? cause.message : 'Requests unavailable.'; }
  finally { if (detailController === controller) detailLoading.value = false; }
}
function closeDetail() { if (submitting.value) return; detailController?.abort(); detailController = null; detailOpen.value = false; }
async function submit() {
  if (!canSubmit.value || !detail.value) return;
  submitting.value = true; detailError.value = '';
  try {
    await requestsApi(`?language=${requestLanguage()}`, { method: 'POST', body: JSON.stringify({ type: detail.value.type, tmdbId: detail.value.tmdbId, seasons: scopeSeasons.value }) });
    submitted.value = true;
    await loadRequests();
    const data = await requestsApi(`/catalog/${detail.value.type}/${detail.value.tmdbId}?language=${requestLanguage()}`);
    detail.value = parseRequestDetail(data);
  } catch (cause) { detailError.value = cause instanceof Error ? cause.message : 'Requests unavailable.'; }
  finally { submitting.value = false; }
}
async function check(item: MediaRequest) {
  if (checking.value) return;
  checking.value = item.id; requestsError.value = '';
  try { await requestsApi(`/${item.id}/check`, { method: 'POST' }); await loadRequests(); }
  catch (cause) { requestsError.value = cause instanceof Error ? cause.message : 'Requests unavailable.'; }
  finally { checking.value = ''; }
}
watch(type, () => { closeDetail(); searchPage.value = 1; void search(); });
watch([contentLanguage, region], () => { if (detailOpen.value && selected.value) void open(selected.value); if (searched.value) void search(); });
watch(section, value => { if (value === 'requests') void loadRequests(); });
onMounted(loadRequests);
useSheetRefreshSchedule({ context: () => section.value, enabled: () => section.value === 'requests', refresh: async () => {
  if (!review.value && !checking.value && !requestsLoading.value) await loadRequests();
} });
onScopeDispose(() => { searchController?.abort(); listController?.abort(); detailController?.abort(); });
</script>

<template>
  <v-container>
    <SectionNavigation v-model="section" :sections="sections">
      <template v-if="section === 'browse'" #controls>
      <form @submit.prevent="search()">
        <v-text-field v-model="query" :label="t('Search')" variant="outlined" hide-details clearable prepend-inner-icon="mdi-magnify" maxlength="200" @click:clear="query = ''; search()" />
      <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-3">
        <MediaTypeToggle v-model="type" />
        <v-btn type="submit" prepend-icon="mdi-magnify" color="primary" variant="outlined" :loading="searchLoading" :disabled="!query || query.trim().length < 2">{{ t('Search') }}</v-btn>
        <v-pagination v-if="searchPages > 1" :model-value="searchPage" :length="searchPages" :total-visible="3" density="compact" rounded :disabled="searchLoading" @update:model-value="search" />
      </div>
      </form>
      </template>
    </SectionNavigation>
    <template v-if="section === 'browse'">
      <v-alert v-if="searchError" type="error" variant="tonal" class="mt-4">{{ t(searchError) }}</v-alert>
      <v-progress-linear v-if="searchLoading" indeterminate color="primary" :aria-label="t('Loading data...')" class="mb-4" />
      <v-row v-if="!searchError" class="mt-1">
        <v-col v-for="item in results" :key="`${item.type}:${item.tmdbId}`" cols="6" sm="4" md="3" lg="2">
          <MediaCard :title="item.title" :poster="item.poster" :subtitle="item.year" :disabled="searchLoading" @open="open(item)"><v-chip color="primary" size="small" variant="tonal">{{ t('Request') }}</v-chip></MediaCard>
        </v-col>
      </v-row>
      <p v-if="!searched" class="text-medium-emphasis py-8 text-center">{{ t('Search for a film or series to request it.') }}</p>
      <p v-else-if="!searchLoading && !searchError && !results.length" class="text-medium-emphasis py-8 text-center">{{ t('No results found.') }}</p>
    </template>
    <template v-else>
      <v-alert v-if="requestsError" type="error" variant="tonal" class="mb-4">{{ t(requestsError) }}</v-alert>
      <v-card class="mt-4">
        <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3">
          <span>{{ administrator ? t('All requests') : t('My requests') }}</span>
          <v-btn prepend-icon="mdi-refresh" color="primary" variant="text" :loading="requestsLoading" :disabled="!!checking" @click="loadRequests">{{ t('Refresh') }}</v-btn>
        </v-card-title>
        <v-card-text>
          <v-progress-linear v-if="requestsLoading && !requestsLoaded" indeterminate color="primary" :aria-label="t('Loading data...')" />
          <div v-for="item in requests" :key="item.id" class="request-row">
            <MediaImage :src="item.poster" :alt="item.title" :width="56" :height="84" cover class="rounded" />
            <div class="request-info">
              <h2 class="text-subtitle-1 font-weight-bold">{{ item.title }}</h2>
              <p class="text-caption text-medium-emphasis">{{ item.year }} · {{ item.type === 'movies' ? t('Movie') : item.seasons === null ? t('Entire series') : t('Seasons {p0}', { p0: item.seasons.join(', ') }) }}</p>
              <p class="text-caption text-medium-emphasis">{{ formatDate(item.createdAt) }}</p>
              <p v-if="administrator && item.subscribers" class="text-caption">{{ t('Requested by {p0}', { p0: item.subscribers.map(user => user.name).join(', ') }) }}</p>
              <p v-if="item.reason" class="text-body-2 mt-1">{{ item.reason }}</p>
              <p v-if="item.actionError" class="text-caption text-warning mt-1">{{ t(item.actionError) }}</p>
              <p v-if="item.availabilityKnown === false" class="text-caption text-warning">{{ t('Availability could not be verified. Last known status is shown.') }}</p>
            </div>
            <div class="request-actions">
              <v-chip :color="requestColor(item.status)" variant="tonal" size="small">{{ t(requestStatus(item.status)) }}</v-chip>
              <v-btn v-if="administrator && item.status === 'pending'" color="primary" variant="outlined" size="small" :disabled="!!requestsError || requestsLoading || !!checking" @click="review = item">{{ t('Review request') }}</v-btn>
              <v-btn v-if="administrator && ['needs-review', 'approved', 'available'].includes(item.status)" color="primary" variant="text" size="small" :loading="checking === item.id" :disabled="requestsLoading || !!checking || !!requestsError" @click="check(item)">{{ t('Check service') }}</v-btn>
            </div>
          </div>
      <p v-if="requestsLoaded && !requestsLoading && !requestsError && !requests.length" class="text-medium-emphasis py-8 text-center">{{ t('No requests yet.') }}</p>
        </v-card-text>
        <v-card-actions v-if="requestsTotal > 20" class="justify-end">
          <v-pagination v-model="requestsPage" :length="Math.ceil(requestsTotal / 20)" :total-visible="3" density="compact" rounded :disabled="requestsLoading" @update:model-value="loadRequests" />
        </v-card-actions>
      </v-card>
    </template>
    <DialogSheet :model-value="detailOpen" :title="selected?.title ?? t('Request media')" :label="t('Request media')" :close-label="t('Close')" :context="selected?.tmdbId" :close-disabled="submitting" @update:model-value="!$event && closeDetail()" @closed="!detailOpen && (selected = null)">
      <v-progress-linear v-if="detailLoading" color="primary" indeterminate :aria-label="t('Loading data...')" class="mb-4" />
      <v-alert v-if="detailError" type="error" variant="tonal" class="mb-4">{{ t(detailError) }}<v-btn v-if="!submitted && selected" variant="text" @click="open(selected)">{{ t('Retry') }}</v-btn></v-alert>
      <v-alert v-if="submitted" type="success" variant="tonal" class="mb-4">{{ t('Your request has been saved.') }}</v-alert>
      <div v-if="detail" class="request-detail">
        <MediaImage :src="detail.poster" :alt="detail.title" :aspect-ratio="2 / 3" cover class="rounded" />
        <div>
          <h2 class="text-h6 mb-2">{{ detail.title }}</h2>
          <p class="text-medium-emphasis mb-3">{{ detail.year }}</p>
          <p class="mb-4">{{ detail.overview }}</p>
          <v-chip v-if="detail.availability === 'available'" color="success" variant="tonal" class="mb-4">{{ t('Available') }}</v-chip>
          <p v-if="detail.availability === 'unknown'" class="text-caption text-medium-emphasis mb-4">{{ t('Availability is currently unknown. You can still send a request.') }}</p>
          <template v-if="detail.type === 'series'">
            <p v-if="!detail.tvdbId" class="text-caption text-warning mb-3">{{ t('This series has no TVDB identifier yet.') }}</p>
            <v-radio-group v-model="scope" :disabled="submitting">
              <v-radio :label="t('Entire series, including future seasons')" value="all" color="primary" />
              <v-radio :label="t('Choose seasons')" value="selected" color="primary" />
            </v-radio-group>
            <v-select v-if="scope === 'selected'" v-model="seasons" :items="seasonChoices" :label="t('Seasons')" variant="outlined" multiple chips :disabled="submitting" />
          </template>
          <v-chip v-if="related" :color="requestColor(related.status)" variant="tonal">{{ t(requestStatus(related.status)) }}</v-chip>
          <p v-if="related?.following" class="text-caption text-medium-emphasis mt-3">{{ t('You are following this request.') }}</p>
        </div>
      </div>
      <template #actions><v-btn color="primary" variant="outlined" :loading="submitting" :disabled="!canSubmit" @click="submit">{{ related ? t('Follow request') : t('Send request') }}</v-btn></template>
    </DialogSheet>
    <RequestReviewDialog :request="review" @close="review = null" @saved="loadRequests" />
  </v-container>
</template>

<style scoped>
.request-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 16px; padding-block: 16px; }
.request-row + .request-row { border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.request-info { min-width: 0; overflow-wrap: anywhere; }
.request-actions { display: flex; flex-direction: column; align-items: end; gap: 12px; }
.request-detail { display: grid; grid-template-columns: minmax(0, 180px) minmax(0, 1fr); align-items: start; gap: 24px; }
@media (max-width: 600px) {
  .request-row { grid-template-columns: 56px minmax(0, 1fr); gap: 12px; }
  .request-actions { grid-column: 2; align-items: start; flex-direction: row; flex-wrap: wrap; }
  .request-detail { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .request-detail > :first-child { max-width: 140px; }
}
</style>
