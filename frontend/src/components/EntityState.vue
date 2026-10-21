<script setup lang="ts">
defineProps<{
  loading?: boolean
  error?: string
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyImage?: string
  errorImage?: string
  errorTitle?: string
}>()
</script>

<template>
  <div v-if="loading" class="empty-panel" role="status" aria-live="polite">
    <div>
      <el-skeleton :rows="4" animated />
      <p class="muted">正在读取浏览器本地数据…</p>
    </div>
  </div>
  <el-result v-else-if="error" icon="error" :title="errorTitle ?? '加载失败'" :sub-title="error">
    <template v-if="errorImage" #icon>
      <img class="state-illustration" :src="errorImage" alt="" width="360" height="260" />
    </template>
    <template #extra>
      <slot name="error-action" />
    </template>
  </el-result>
  <div v-else-if="empty" class="empty-panel">
    <el-empty :description="emptyTitle ?? '还没有数据'">
      <template v-if="emptyImage" #image>
        <img class="state-illustration" :src="emptyImage" alt="" width="360" height="260" />
      </template>
      <p class="muted">{{ emptyDescription }}</p>
      <slot />
    </el-empty>
  </div>
  <slot v-else name="content" />
</template>

<style scoped>
.state-illustration {
  display: block;
  width: 240px;
  max-width: 100%;
  height: auto;
  aspect-ratio: 360 / 260;
  object-fit: contain;
}

:deep(.el-empty__image:has(.state-illustration)) {
  width: 240px;
  max-width: 100%;
}
</style>
