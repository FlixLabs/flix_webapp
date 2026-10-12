<script setup lang="ts">
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
function formatDate(value: string) { return value ? new Date(value).toLocaleString() : 'No successful response yet'; }
</script>

<template>
  <section class="mt-4" aria-label="Integration status">
    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
      <div>
        <h3>Integrations</h3>
        <p class="text-caption text-medium-emphasis">Checked every 60 seconds while this section is open. Read-only checks; no media actions are triggered.</p>
      </div>
    </div>
    <v-row>
      <v-col v-for="service in services" :key="service.id" cols="12" md="6">
        <v-card :aria-label="`${service.name} integration`" class="h-100" border>
          <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2">
            <span>{{ service.name }}</span>
            <v-chip :color="states[service.state].color" :prepend-icon="states[service.state].icon" size="small">{{ states[service.state].label }}</v-chip>
          </v-card-title>
          <v-card-text aria-live="polite">
            <p>{{ service.message || 'Waiting for a check.' }}</p>
            <p v-if="service.version" class="text-caption mt-2">Version: {{ service.version }}</p>
            <p class="text-caption mt-2">Last valid response: {{ formatDate(service.lastSuccessAt) }}</p>
            <p v-if="service.checkedAt" class="text-caption text-medium-emphasis">Last check: {{ formatDate(service.checkedAt) }}</p>
          </v-card-text>
          <v-card-actions>
            <v-btn :aria-label="`Retry ${service.name}`" :loading="service.state === 'checking'"
              :disabled="['disabled', 'unconfigured'].includes(service.state)" prepend-icon="mdi-refresh"
              @click="emit('retry', service.id)">Retry</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>
