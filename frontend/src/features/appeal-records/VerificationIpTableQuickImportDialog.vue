<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'

import { dataService } from '../../data/data-service'
import type { AppealRecord } from '../../domain/entities'
import type { PlatformId } from '../../domain/platform'
import { buildVerificationIpTableQuickImport } from './verification-ip-table-quick-import'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  platformId: PlatformId
  platformLabel: string
}>()
const emit = defineEmits<{ imported: [] }>()

const credentialText = ref('')
const importing = ref(false)
const records = ref<AppealRecord[]>([])
const loading = ref(false)
const loadError = ref('')
let sequence = 0
const importResult = computed(() =>
  buildVerificationIpTableQuickImport(records.value, credentialText.value),
)
const issueDescription = computed(() => {
  const issues: string[] = []
  if (importResult.value.invalidLines.length) {
    issues.push(
      `格式错误 ${importResult.value.invalidLines.length} 条（第 ${lineNumbers(
        importResult.value.invalidLines,
      )} 行）`,
    )
  }
  if (importResult.value.unmatchedLines.length) {
    issues.push(
      `未匹配网段 ${importResult.value.unmatchedLines.length} 条（第 ${lineNumbers(
        importResult.value.unmatchedLines,
      )} 行）`,
    )
  }
  if (importResult.value.duplicateNetworks.length) {
    issues.push(`重复网段 ${importResult.value.duplicateNetworks.length} 个，已使用最后一条`)
  }
  return issues.join('；')
})
const canImport = computed(
  () =>
    importResult.value.updates.length > 0 && !importing.value && !loading.value && !loadError.value,
)

watch(visible, async (opened) => {
  const request = ++sequence
  if (!opened) return
  credentialText.value = ''
  records.value = []
  loading.value = true
  loadError.value = ''
  try {
    const all = await dataService.listRecords(props.platformId)
    if (request === sequence) records.value = all
  } catch (error) {
    if (request === sequence)
      loadError.value = error instanceof Error ? error.message : '读取网段失败'
  } finally {
    if (request === sequence) loading.value = false
  }
})

function lineNumbers(lines: Array<{ lineNumber: number }>) {
  return lines.map((line) => line.lineNumber).join('、')
}

function beforeClose(done: () => void) {
  if (!importing.value) done()
}

async function confirmImport() {
  const result = importResult.value
  if (importing.value) return
  if (result.updates.length === 0) {
    ElMessage.warning('没有找到可写入的 IP 网段')
    return
  }

  importing.value = true
  try {
    const saved = await dataService.importVerificationIps(props.platformId, credentialText.value)
    emit('imported')
    ElMessage.success(
      `已更新 ${saved.updatedCount} 个匹配项；格式错误 ${saved.invalidLines.length} 行，未匹配 ${saved.unmatchedLines.length} 行`,
    )
    visible.value = false
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'IP 账密批量写入失败')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`整表导入 IP 账密 · ${platformLabel}`"
    width="min(820px, 96vw)"
    top="5vh"
    destroy-on-close
    :before-close="beforeClose"
    :close-on-click-modal="!importing"
    :close-on-press-escape="!importing"
    :show-close="!importing"
  >
    <el-alert
      v-if="loading || loadError"
      :title="loadError || '正在读取整个平台的网段…'"
      :type="loadError ? 'error' : 'info'"
      :closable="false"
    />
    <el-alert
      title="自动对比当前平台的全部申诉记录"
      description="每行粘贴一条 IP:端口:账号:密码。系统会查找验证 IP 所属的 IP 或网段，并写入所有包含该网段的记录；未涉及网段的原有账密会保留。"
      type="info"
      :closable="false"
      show-icon
      class="table-import-help"
    />

    <el-form label-position="top">
      <el-form-item label="IP 账密（每行一个）" required>
        <el-input
          v-model="credentialText"
          type="textarea"
          :rows="10"
          resize="vertical"
          autocomplete="off"
          :disabled="importing"
          aria-label="整表 IP 账密快速导入"
          :placeholder="'203.0.113.25:6728:账号:密码\\\n198.51.100.42:7311:账号:密码'"
        />
      </el-form-item>
    </el-form>

    <el-alert
      v-if="issueDescription"
      title="部分内容不会写入"
      :description="issueDescription"
      type="warning"
      :closable="false"
      show-icon
      class="table-import-issues"
    />

    <div v-if="credentialText.trim()" class="table-import-summary">
      <strong>整表匹配结果</strong>
      <el-tag :type="importResult.assignments.length ? 'success' : 'info'">
        已匹配 {{ importResult.assignments.length }} 个网段
      </el-tag>
      <el-tag :type="importResult.updates.length ? 'primary' : 'info'">
        将更新 {{ importResult.updates.length }} 条记录
      </el-tag>
    </div>

    <template #footer>
      <el-button :disabled="importing" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="importing" :disabled="!canImport" @click="confirmImport">
        确认写入 {{ importResult.updates.length }} 条记录
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.table-import-help,
.table-import-issues {
  margin-bottom: 16px;
}

.table-import-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 14px 16px;
  background: #f7fafc;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.table-import-summary strong {
  margin-right: auto;
  color: var(--navy);
}
</style>
