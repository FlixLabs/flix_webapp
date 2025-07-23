<script setup lang="ts">

const props = defineProps<{
  alert: {
    type: Object,
    required: true,
    default: () => ({
      visible: false,
      type: 'info',
      icon: '',
      text: ''
    })
  }
}>();

function hideAlert() {
  emits('update:alert', { ...props.alert, visible: false });
}
</script>

<template>
  <transition
    name="fade"
    @before-enter="before-enter"
    @enter="enter"
    @leave="leave"
    >
    <v-alert
      v-if="alert.visible"
      :type="alert.type"
      :icon="alert.icon"
      class="fixed-alert"
      :text="alert.text"
      @click="hideAlert"
      />
  </transition>
</template>

<style scoped>
.fixed-alert {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 9999;
  max-width: 300px;
}

.fade-enter-active,

.fade-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.fade-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
