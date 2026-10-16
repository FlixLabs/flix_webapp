<script setup lang="ts">
import { t, formatDate } from '@/i18n';
import type { IntegrationId, IntegrationState, IntegrationStatus } from '@/composables/useIntegrationStatus';
defineProps<{ services: IntegrationStatus[] }>();
const emit = defineEmits<{ retry: [id: IntegrationId] }>();
const states: Record<IntegrationState, { label: string; color: string; icon: string }> = {
  idle: { label: 'Not checked', color: 'secondary', icon: 'mdi-help-circle-outline' },
  checking: { label: 'Checking', color: 'primary', icon: 'mdi-progress-clock' },
  available: { label: 'Available', color: 'success', icon: 'mdi-check-circle-outline' },
  degraded: { label: 'Degraded', color: 'warning', icon: 'mdi-alert-outline' },
  unavailable: { label: 'Unavailable', color: 'error', icon: 'mdi-close-circle-outline' },
  unconfigured: { label: 'Not configured', color: 'secondary', icon: 'mdi-cog-outline' },
  disabled: { label: 'Not used', color: 'secondary', icon: 'mdi-minus-circle-outline' },
};
function lastChecked(value: string) { return value ? formatDate(new Date(value)) : t('No successful response yet'); }
</script>

<template>
  <section class="mt-4" :aria-label="t('Integration status')">
    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
      <div>
        <h3>{{ t("Integrations") }}</h3>
        <p class="text-caption text-medium-emphasis">{{ t("Checked every 60 seconds while this section is open. Read-only checks; no media actions are triggered.") }}</p>
      </div>
    </div>
    <v-row>
      <v-col v-for="service in services" :key="service.id" cols="12" md="6">
        <v-card :aria-label="t('{p0} integration', { p0: t(service.name) })" class="h-100" border>
          <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2">
            <span>{{ t(service.name) }}</span>
            <v-chip :color="states[service.state].color" :prepend-icon="states[service.state].icon" size="small">{{ t(states[service.state].label) }}</v-chip>
          </v-card-title>
          <v-card-text aria-live="polite">
            <p>{{ t(service.message) || t("Waiting for a check.") }}</p>
            <p v-if="service.version" class="text-caption mt-2">{{ t("Version: {p0}", { p0: service.version }) }}</p>
            <p class="text-caption mt-2">{{ t("Last valid response: {p0}", { p0: lastChecked(service.lastSuccessAt) }) }}</p>
            <p v-if="service.checkedAt" class="text-caption text-medium-emphasis">{{ t("Last check: {p0}", { p0: formatDate(service.checkedAt) }) }}</p>
          </v-card-text>
          <v-card-actions>
            <v-btn :aria-label="t('Retry {p0}', { p0: service.name })" :loading="service.state === 'checking'"
              :disabled="['disabled', 'unconfigured'].includes(service.state)" prepend-icon="mdi-refresh"
              @click="emit('retry', service.id)">{{ t("Retry") }}</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>
