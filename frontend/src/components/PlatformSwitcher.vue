<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { platforms, type PlatformId } from '../domain/platform'

const props = defineProps<{ modelValue: PlatformId }>()

const route = useRoute()
const router = useRouter()

const activeSection = computed(() => String(route.name ?? 'accounts'))

function select(platformId: PlatformId) {
  void router.push({
    name: activeSection.value,
    params: { platform: platformId },
  })
}
</script>

<template>
  <div class="platform-switcher" aria-label="平台切换">
    <button
      v-for="platform in platforms"
      :key="platform.id"
      type="button"
      class="platform-button"
      :class="[`platform-button--${platform.id}`, { active: platform.id === props.modelValue }]"
      :aria-label="platform.label"
      :aria-pressed="platform.id === props.modelValue"
      :style="{ '--platform-accent': platform.accent }"
      @click="select(platform.id)"
    >
      <span v-if="platform.id === 'google'" class="google-wordmark" aria-hidden="true">
        <span class="blue">G</span><span class="red">o</span><span class="yellow">o</span
        ><span class="blue">g</span><span class="green">l</span><span class="red">e</span>
      </span>
      <span v-else>{{ platform.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.platform-switcher {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  min-height: 48px;
}

.platform-button {
  min-width: 0;
  min-height: 48px;
  padding: 0 16px;
  color: var(--platform-accent);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  background: var(--surface);
  border: 2px solid var(--platform-accent);
  border-radius: 8px;
}

.platform-button:hover {
  background: var(--platform-hover, var(--surface));
}

.platform-button.active {
  color: #fff;
  font-weight: 700;
  background: var(--platform-accent);
}

.platform-button--ins {
  --platform-hover: #fff;
  background: #fff;
}

.platform-button--google,
.platform-button--google:hover {
  background:
    linear-gradient(#fff, #fff) padding-box,
    linear-gradient(90deg, #ea4335 0 25%, #fbbc05 25% 50%, #4285f4 50% 75%, #34a853 75% 100%)
      border-box;
  border-color: transparent;
}

.platform-button--google.active {
  background: var(--platform-accent);
  border-color: var(--platform-accent);
}

.google-wordmark {
  display: inline-flex;
  font-weight: 700;
}

.google-wordmark .blue {
  color: #4285f4;
}

.google-wordmark .red {
  color: #ea4335;
}

.google-wordmark .yellow {
  color: #fbbc05;
}

.google-wordmark .green {
  color: #34a853;
}

.platform-button--google.active .google-wordmark span {
  color: #fff;
}

.platform-button--tiktok {
  --platform-hover: #f0f0f0;
}

.platform-button--ping0 {
  --platform-hover: #fffbea;
  color: var(--platform-accent);
  background: #fff;
}

.platform-button--ping0.active {
  color: #171717;
  background: #facc15;
  border-color: #facc15;
}
</style>
