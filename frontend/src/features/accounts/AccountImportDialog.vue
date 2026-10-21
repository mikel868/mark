<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'

import { dataService } from '../../data/data-service'
import { getAccountFields, getAccountLocationLabel } from '../../domain/account-fields'
import type { Account, EntityInput } from '../../domain/entities'
import type { PlatformId } from '../../domain/platform'
import { parseAccountImport } from './account-import'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  platformId: PlatformId
  platformLabel: string
}>()
const emit = defineEmits<{ imported: [] }>()

const importText = ref('')
const importing = ref(false)
const accountFields = computed(() => getAccountFields(props.platformId))
const locationLabel = computed(() => getAccountLocationLabel(props.platformId))
const importPlaceholder = computed(() => {
  if (props.platformId === 'tiktok') {
    return [
      '账号 ---- 密码 ---- 邮箱 ---- 邮箱密码 ---- [解码链接](解码链接) ---- 具体地区',
      'demo-user ---- account-password ---- demo@example.com ---- email-password ---- [https://decoder.example.com/pickup?email=demo@example.com](https://decoder.example.com/pickup?email=demo@example.com) ---- 泰国',
    ].join('\n')
  }

  const header = `| ${accountFields.value.map((field) => field.label).join(' | ')} |`
  const separator = `| ${accountFields.value.map(() => '---').join(' | ')} |`
  const example = `| ${accountFields.value.map((field) => field.example).join(' | ')} |`
  return [header, separator, example].join('\n')
})
const importResult = computed(() => parseAccountImport(importText.value, props.platformId))
const validImportCount = computed(
  () => importResult.value.rows.filter((row) => row.input !== null).length,
)
const invalidImportCount = computed(() => importResult.value.rows.length - validImportCount.value)
const incompleteImportCount = computed(
  () =>
    importResult.value.rows.filter((row) => row.input !== null && row.missingFields.length > 0)
      .length,
)
const canImport = computed(
  () =>
    importResult.value.error === '' &&
    importResult.value.rows.length > 0 &&
    invalidImportCount.value === 0,
)

watch(visible, () => {
  importText.value = ''
})

function beforeClose(done: () => void) {
  if (!importing.value) done()
}

async function confirmImport() {
  if (importing.value) return

  const result = importResult.value
  if (result.error) {
    ElMessage.warning(result.error)
    return
  }
  if (result.rows.some((row) => row.input === null)) {
    ElMessage.warning('请先修正全部格式错误行')
    return
  }

  const inputs: EntityInput<Account>[] = []
  for (const row of result.rows) {
    if (row.input) inputs.push(row.input)
  }

  importing.value = true
  try {
    await dataService.importAccounts(inputs)
    emit('imported')
    ElMessage.success(`已向 ${props.platformLabel} 导入 ${inputs.length} 个账号`)
    visible.value = false
    importText.value = ''
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`批量导入账号 · ${platformLabel}`"
    width="min(1080px, 96vw)"
    top="3vh"
    destroy-on-close
    :before-close="beforeClose"
    :close-on-click-modal="!importing"
    :close-on-press-escape="!importing"
    :show-close="!importing"
  >
    <el-alert
      title="数据保存到服务器，所有设备共享"
      :description="
        platformId === 'tiktok'
          ? 'TikTok 支持无表头的“账号 ---- 密码 ---- 邮箱 ---- 邮箱密码 ---- [解码链接](解码链接) ---- 具体地区”格式，最后一段填写泰国、墨西哥、韩国等具体地区，令牌不用填写；旧数据中的 MX、KR 等两位代码仍会自动转换。也兼容 Markdown 表格、CSV 和从表格软件复制的内容。字段可以留空，预览会显示具体缺失项。'
          : '支持 Markdown 表格、CSV，以及从 Excel 或表格软件直接复制的内容。字段或整列可以留空，预览会显示具体缺失项；只有表格格式错误时才会阻止导入。'
      "
      type="info"
      :closable="false"
      show-icon
      class="import-help"
    />

    <el-form label-position="top">
      <el-form-item label="粘贴账号表格">
        <el-input
          v-model="importText"
          type="textarea"
          :rows="10"
          resize="vertical"
          autocomplete="off"
          :placeholder="importPlaceholder"
        />
      </el-form-item>
    </el-form>

    <el-alert
      v-if="importText.trim() && importResult.error"
      :title="importResult.error"
      type="error"
      :closable="false"
      show-icon
      class="import-result"
    />

    <div v-if="importResult.rows.length" class="import-preview">
      <div class="import-summary">
        <strong>导入预览</strong>
        <el-tag type="success">可导入 {{ validImportCount }} 行</el-tag>
        <el-tag v-if="incompleteImportCount" type="warning">
          信息不完整 {{ incompleteImportCount }} 行
        </el-tag>
        <el-tag v-if="invalidImportCount" type="danger">
          格式错误 {{ invalidImportCount }} 行
        </el-tag>
      </div>

      <el-table :data="importResult.rows" max-height="330" stripe class="desktop-import-table">
        <el-table-column prop="lineNumber" label="原表行" width="80" />
        <el-table-column prop="values.country" :label="locationLabel" min-width="120" />
        <el-table-column prop="values.account" label="账号" min-width="160" />
        <el-table-column
          prop="values.emailAccount"
          label="邮箱账号"
          min-width="220"
          show-overflow-tooltip
        />
        <el-table-column label="导入提示" min-width="300">
          <template #default="scope">
            <span v-if="scope.row.errors.length" class="import-error">
              {{ scope.row.errors.join('；') }}
            </span>
            <span v-else-if="scope.row.missingFields.length" class="import-warning">
              缺少：{{ scope.row.missingFields.join('、') }}（仍可导入）
            </span>
            <span v-else class="import-valid">字段完整</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="mobile-import-list">
        <article v-for="row in importResult.rows" :key="row.lineNumber" class="mobile-import-row">
          <div class="mobile-import-heading">
            <strong
              >原表第 {{ row.lineNumber }} 行 ·
              {{ row.values.country || `未填写${locationLabel}` }}</strong
            >
            <el-tag v-if="row.errors.length" type="danger" size="small">需要修正</el-tag>
            <el-tag v-else-if="row.missingFields.length" type="warning" size="small">
              信息不完整
            </el-tag>
            <el-tag v-else type="success" size="small">可以导入</el-tag>
          </div>
          <span>{{ row.values.account || '未填写账号' }}</span>
          <small>{{ row.values.emailAccount || '未填写邮箱账号' }}</small>
          <p v-if="row.errors.length" class="import-error">{{ row.errors.join('；') }}</p>
          <p v-else-if="row.missingFields.length" class="import-warning">
            缺少：{{ row.missingFields.join('、') }}
          </p>
          <p v-else class="import-valid">字段完整</p>
        </article>
      </div>
    </div>

    <template #footer>
      <el-button :disabled="importing" @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="importing"
        :disabled="!canImport || importing"
        @click="confirmImport"
      >
        确认导入 {{ validImportCount }} 行
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-help,
.import-result {
  margin-bottom: 16px;
}

.import-preview {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.import-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 13px 15px;
  background: #f7fafc;
  border-bottom: 1px solid var(--line);
}

.import-summary strong {
  margin-right: auto;
  color: var(--navy);
}

.import-error {
  color: var(--el-color-danger);
}

.import-warning {
  color: var(--el-color-warning-dark-2);
  font-weight: 650;
}

.import-valid {
  color: var(--el-color-success);
  font-weight: 650;
}

.mobile-import-list {
  display: none;
}

@media (max-width: 720px) {
  .desktop-import-table {
    display: none;
  }

  .mobile-import-list {
    display: grid;
    max-height: 310px;
    overflow-y: auto;
  }

  .mobile-import-row {
    padding: 13px 15px;
    border-bottom: 1px solid var(--line);
  }

  .mobile-import-row:last-child {
    border-bottom: 0;
  }

  .mobile-import-heading {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    justify-content: space-between;
  }

  .mobile-import-heading strong,
  .mobile-import-row span,
  .mobile-import-row small {
    overflow-wrap: anywhere;
  }

  .mobile-import-row span,
  .mobile-import-row small {
    display: block;
    margin-top: 5px;
  }

  .mobile-import-row small {
    color: var(--muted);
  }

  .mobile-import-row p {
    margin: 8px 0 0;
    font-size: 0.82rem;
  }
}
</style>
