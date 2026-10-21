<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { copyText } from '../utils/clipboard'

const props = defineProps<{
  value: string
  label?: string
}>()

async function copyValue() {
  try {
    await copyText(props.value)
    ElMessage.success(`${props.label ?? '内容'}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}
</script>

<template>
  <span class="copy-field">
    <code class="copy-field__value">{{ value }}</code>
    <el-button
      class="copy-field__button"
      text
      size="small"
      :aria-label="`复制${label ?? '内容'}`"
      @click="copyValue"
    >
      复制
    </el-button>
  </span>
</template>

<style scoped>
.copy-field {
  display: flex;
  width: 100%;
  min-width: 0;
  gap: 6px;
  align-items: center;
}

.copy-field__value {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--navy-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-field__button {
  flex: 0 0 auto;
  margin-left: 0;
  padding-inline: 4px;
}
</style>
