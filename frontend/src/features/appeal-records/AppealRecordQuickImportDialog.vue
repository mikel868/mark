<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'

import { dataService } from '../../data/data-service'
import type { PlatformId } from '../../domain/platform'
import {
  DEFAULT_APPEAL_RECORD_IMPORT_GROUP_SIZE,
  parseAppealRecordQuickImport,
} from './appeal-record-quick-import'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  platformId: PlatformId
  platformLabel: string
}>()
const emit = defineEmits<{ imported: [] }>()

const country = ref('')
const networkText = ref('')
const groupSize = ref(DEFAULT_APPEAL_RECORD_IMPORT_GROUP_SIZE)
const importing = ref(false)
const groupSizeIsValid = computed(() => Number.isInteger(groupSize.value) && groupSize.value >= 1)
const groupSizeHelpTitle = computed(() =>
  groupSizeIsValid.value
    ? `每 ${groupSize.value} 个网段生成一条记录`
    : '请输入每条记录包含的网段数量',
)
const importResult = computed(() =>
  parseAppealRecordQuickImport(
    networkText.value,
    groupSizeIsValid.value ? groupSize.value : DEFAULT_APPEAL_RECORD_IMPORT_GROUP_SIZE,
  ),
)
const previewRows = computed(() =>
  groupSizeIsValid.value
    ? importResult.value.groups.map((ips, index) => ({ number: index + 1, ips }))
    : [],
)
const canImport = computed(
  () =>
    groupSizeIsValid.value &&
    country.value.trim().length > 0 &&
    importResult.value.errors.length === 0 &&
    importResult.value.groups.length > 0,
)
const errorDescription = computed(() =>
  importResult.value.errors
    .map((error) => `第 ${error.lineNumber} 行“${error.value}”：${error.message}`)
    .join('；'),
)

watch(visible, (opened) => {
  if (!opened) return
  country.value = ''
  networkText.value = ''
  groupSize.value = DEFAULT_APPEAL_RECORD_IMPORT_GROUP_SIZE
})

function beforeClose(done: () => void) {
  if (!importing.value) done()
}

async function confirmImport() {
  if (importing.value) return
  const normalizedCountry = country.value.trim()
  if (!groupSizeIsValid.value) {
    ElMessage.warning('每条记录的网段数量必须是大于等于 1 的整数')
    return
  }
  if (!normalizedCountry) {
    ElMessage.warning('国家不能为空')
    return
  }
  if (importResult.value.errors.length > 0) {
    ElMessage.warning('请先修正格式错误的网段')
    return
  }
  if (importResult.value.groups.length === 0) {
    ElMessage.warning('请至少输入一个网段')
    return
  }

  importing.value = true
  try {
    const result = await dataService.quickImportRecords(
      props.platformId,
      normalizedCountry,
      importResult.value.groups.flat().join('\n'),
      groupSize.value,
    )
    emit('imported')
    ElMessage.success(`已生成 ${result.count} 条申诉记录`)
    visible.value = false
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '快速导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`快速导入申诉记录 · ${platformLabel}`"
    width="min(860px, 96vw)"
    top="4vh"
    destroy-on-close
    :before-close="beforeClose"
    :close-on-click-modal="!importing"
    :close-on-press-escape="!importing"
    :show-close="!importing"
  >
    <el-alert
      :title="groupSizeHelpTitle"
      description="国家会应用到本次全部记录；网段每行一个。三段式 IPv4（例如 209.166.41）会自动转换为 209.166.41.0/24，完整 IP 和 CIDR 也可以直接输入。"
      type="info"
      :closable="false"
      show-icon
      class="quick-import-help"
    />

    <el-form label-position="top">
      <el-form-item label="国家" required>
        <el-input v-model="country" autocomplete="off" placeholder="例如：美国" />
      </el-form-item>
      <el-form-item label="每条记录包含的网段数量" required>
        <el-input-number
          v-model="groupSize"
          :min="1"
          :step="1"
          step-strictly
          controls-position="right"
          aria-label="每条记录包含的网段数量"
        />
      </el-form-item>
      <el-form-item label="网段列表（每行一个）" required>
        <el-input
          v-model="networkText"
          type="textarea"
          :rows="10"
          resize="vertical"
          autocomplete="off"
          :placeholder="'209.166.41\n205.179.217\n194.179.156.0/24\n2001:db8::/32'"
        />
      </el-form-item>
    </el-form>

    <el-alert
      v-if="networkText.trim() && importResult.errors.length"
      :title="`发现 ${importResult.errors.length} 行格式错误`"
      :description="errorDescription"
      type="error"
      :closable="false"
      show-icon
      class="quick-import-result"
    />

    <div v-if="previewRows.length" class="quick-import-preview">
      <div class="quick-import-summary">
        <strong>导入预览</strong>
        <el-tag type="success">共 {{ importResult.normalizedIps.length }} 个网段</el-tag>
        <el-tag type="primary">将生成 {{ previewRows.length }} 条记录</el-tag>
        <el-tag v-if="importResult.duplicateCount" type="warning">
          已忽略 {{ importResult.duplicateCount }} 个重复网段
        </el-tag>
      </div>

      <el-table :data="previewRows" max-height="320" stripe>
        <el-table-column prop="number" label="记录" width="80" />
        <el-table-column label="国家" min-width="110">
          <template #default>{{ country.trim() || '未填写' }}</template>
        </el-table-column>
        <el-table-column label="网段" min-width="300">
          <template #default="scope">
            <span v-for="ip in scope.row.ips" :key="ip" class="preview-network">{{ ip }}</span>
          </template>
        </el-table-column>
        <el-table-column label="数量" width="80">
          <template #default="scope">{{ scope.row.ips.length }}/{{ groupSize }}</template>
        </el-table-column>
      </el-table>
    </div>

    <template #footer>
      <el-button :disabled="importing" @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="importing"
        :disabled="!canImport || importing"
        @click="confirmImport"
      >
        确认生成 {{ previewRows.length }} 条记录
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.quick-import-help,
.quick-import-result {
  margin-bottom: 16px;
}

.quick-import-preview {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.quick-import-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 13px 15px;
  background: #f7fafc;
  border-bottom: 1px solid var(--line);
}

.quick-import-summary strong {
  margin-right: auto;
  color: var(--navy);
}

.preview-network {
  display: block;
  overflow-wrap: anywhere;
  line-height: 1.55;
}
</style>
