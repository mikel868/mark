<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

import { useAuth } from '../../auth/auth-service'
import { dataService } from '../../data/data-service'
import { ApiError, downloadBlob } from '../../data/api-client'
import {
  backupCounts,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_MEGABYTES,
  parseBackup,
  type BackupDocument,
} from './backup-service'

const auth = useAuth()

const currentCounts = ref({ accounts: 0, modules: 0, steps: 0, records: 0, images: 0 })
const preview = shallowRef<BackupDocument | null>(null)
const previewName = ref('')
const exporting = ref(false)
const importing = ref(false)
const sourceFile = shallowRef<File | null>(null)
const operationId = ref('')
const uncertain = ref(false)
const loadError = ref('')
const checking = ref(false)
let fileSelectionSequence = 0
const previewCounts = computed(() =>
  preview.value
    ? backupCounts(preview.value)
    : { accounts: 0, modules: 0, steps: 0, records: 0, images: 0 },
)

async function refreshCounts() {
  loadError.value = ''
  try {
    currentCounts.value = await dataService.countAll()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '统计读取失败'
  }
}

async function exportData() {
  exporting.value = true
  try {
    downloadBlob(
      await dataService.exportBackup(),
      `appeal-backup-${new Date().toISOString().slice(0, 10)}.json`,
    )
    ElMessage.success('备份文件已下载')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败')
  } finally {
    exporting.value = false
  }
}

async function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (importing.value || uncertain.value) return
  const sequence = ++fileSelectionSequence
  preview.value = null
  previewName.value = ''
  sourceFile.value = null
  if (!file) return
  try {
    if (file.size > MAX_BACKUP_BYTES) {
      throw new Error(`备份文件超过 ${MAX_BACKUP_MEGABYTES} MB 安全上限`)
    }
    const parsed = parseBackup(await file.text())
    if (sequence !== fileSelectionSequence) return
    preview.value = parsed
    sourceFile.value = file
    operationId.value = crypto.randomUUID()
    previewName.value = file.name
    ElMessage.success('备份验证通过，请检查数量后确认恢复')
  } catch (error) {
    if (sequence !== fileSelectionSequence) return
    ElMessage.error(error instanceof Error ? error.message : '无法读取备份')
  } finally {
    if (sequence === fileSelectionSequence) input.value = ''
  }
}

async function restore() {
  if (!preview.value || !sourceFile.value || importing.value) return
  const file = sourceFile.value
  const id = operationId.value
  importing.value = true
  try {
    await ElMessageBox.confirm(
      '恢复会完整替换服务器上全部四个平台的共享数据和证据图片，影响所有设备和用户。请先保存服务器备份，恢复期间暂停其他操作。是否继续？',
      '确认恢复备份',
      { confirmButtonText: '替换并恢复', cancelButtonText: '取消', type: 'warning' },
    )
    await dataService.restoreBackup(file, id)
    uncertain.value = false
    preview.value = null
    previewName.value = ''
    sourceFile.value = null
    await refreshCounts()
    ElMessage.success('备份恢复完成')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
        uncertain.value = true
      ElMessage.error(error instanceof Error ? error.message : '恢复结果未确认，请查询回执')
    }
  } finally {
    importing.value = false
  }
}

async function checkReceipt() {
  checking.value = true
  try {
    await dataService.restoreReceipt(operationId.value)
    uncertain.value = false
    preview.value = null
    sourceFile.value = null
    await refreshCounts()
    ElMessage.success('服务器已确认恢复成功')
  } catch (error) {
    ElMessage.warning(
      error instanceof ApiError && error.status === 404
        ? '尚无成功回执，不代表恢复失败。请稍后查询；重试会使用相同文件和操作编号。'
        : error instanceof Error
          ? error.message
          : '查询失败',
    )
  } finally {
    checking.value = false
  }
}

function preventUnload(event: BeforeUnloadEvent) {
  if (!importing.value && !uncertain.value) return
  event.preventDefault()
  event.returnValue = ''
}
onBeforeRouteLeave(() => {
  if (!importing.value && !uncertain.value) return true
  ElMessage.warning('请先确认恢复结果，再离开备份页面')
  return false
})
onMounted(() => {
  void refreshCounts()
  window.addEventListener('beforeunload', preventUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', preventUnload))
</script>

<template>
  <div>
    <div class="page-toolbar">
      <div class="page-title">
        <h1>服务器备份与恢复</h1>
        <p>备份覆盖全部四个平台，包括账号、流程、申诉记录和证据图片。</p>
      </div>
    </div>

    <el-alert
      title="备份文件包含账号密码"
      description="导出下载服务器完整数据；恢复会上传文件并覆盖全部共享数据。请把备份保存在可信位置，不要提交到公开 Git 仓库。"
      type="warning"
      :closable="false"
      show-icon
      class="backup-alert"
    />
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
    <el-button @click="refreshCounts">刷新统计</el-button>
    <el-alert
      v-if="uncertain"
      title="恢复结果尚未确认，请保留此页面和原文件，先查询回执再决定重试。"
      type="warning"
      :closable="false"
    />
    <el-button v-if="uncertain" :loading="checking" @click="checkReceipt">查询恢复结果</el-button>

    <div class="backup-grid">
      <section class="page-card backup-card">
        <span class="card-index">01 / EXPORT</span>
        <h2>导出完整备份</h2>
        <p>将账号、模块、步骤、申诉记录和验证证据图片保存为一个 JSON 文件。</p>
        <div class="count-grid">
          <div>
            <strong>{{ currentCounts.accounts }}</strong
            ><span>账号</span>
          </div>
          <div>
            <strong>{{ currentCounts.modules }}</strong
            ><span>模块</span>
          </div>
          <div>
            <strong>{{ currentCounts.steps }}</strong
            ><span>步骤</span>
          </div>
          <div>
            <strong>{{ currentCounts.records }}</strong
            ><span>记录</span>
          </div>
          <div>
            <strong>{{ currentCounts.images }}</strong
            ><span>证据图片</span>
          </div>
        </div>
        <el-button type="primary" size="large" :loading="exporting" @click="exportData">
          下载备份文件
        </el-button>
      </section>

      <section class="page-card backup-card">
        <span class="card-index">02 / RESTORE</span>
        <h2>恢复备份</h2>
        <p>
          先验证文件和预览数量，确认后原子替换服务器全部数据。旧版 v1
          备份不含图片，恢复后图片将为空。
        </p>
        <label v-if="auth.canWrite.value" class="file-picker">
          <input
            type="file"
            accept="application/json,.json"
            :disabled="importing || uncertain"
            @change="selectFile"
          />
          <span>选择 JSON 备份</span>
        </label>

        <el-alert
          v-else
          title="只读账号不能恢复备份"
          description="如需替换当前数据，请退出并使用管理员账号登录。"
          type="info"
          :closable="false"
          show-icon
        />

        <div v-if="auth.canWrite.value && preview" class="preview-panel" role="status">
          <strong>{{ previewName }}</strong>
          <small>导出时间：{{ new Date(preview.exportedAt).toLocaleString('zh-CN') }}</small>
          <div class="preview-counts">
            <span>账号 {{ previewCounts.accounts }}</span>
            <span>模块 {{ previewCounts.modules }}</span>
            <span>步骤 {{ previewCounts.steps }}</span>
            <span>记录 {{ previewCounts.records }}</span>
            <span>证据图片 {{ previewCounts.images }}</span>
          </div>
          <el-button type="danger" :loading="importing" @click="restore">替换并恢复</el-button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.backup-alert {
  min-height: 80px;
  margin-bottom: 16px;
}

.backup-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.backup-card {
  display: flex;
  flex-direction: column;
  min-height: 560px;
  padding: 32px;
}

.card-index {
  display: inline-block;
  margin-bottom: 24px;
  color: var(--am-primary);
  font-size: 13px;
  font-weight: 400;
}

.backup-card h2 {
  margin: 0 0 24px;
  color: var(--navy);
  font-size: 24px;
  line-height: 34px;
}

.backup-card > p {
  min-height: 22px;
  margin: 0 0 24px;
  color: var(--muted);
  font-size: 14px;
  line-height: 22px;
}

.count-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-content: flex-start;
  min-height: 166px;
  padding: 24px;
  background: var(--am-bg);
}

.count-grid div {
  display: flex;
  gap: 4px;
  align-items: baseline;
}

.count-grid strong,
.count-grid span {
  display: inline;
}

.count-grid strong {
  color: var(--navy);
  font-size: 14px;
  font-weight: 400;
}

.count-grid span {
  color: var(--navy);
  font-size: 14px;
}

.backup-card > .el-button {
  align-self: flex-start;
  margin-top: auto;
}

.file-picker {
  display: grid;
  min-height: 180px;
  color: var(--navy);
  font-weight: 500;
  cursor: pointer;
  background: var(--am-bg);
  border: 1px solid var(--line);
  border-radius: 0;
  place-items: center;
}

.file-picker input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.preview-panel {
  position: relative;
  z-index: 1;
  padding: 15px;
  margin-top: 14px;
  background: #fbfcfe;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.preview-panel strong,
.preview-panel small {
  display: block;
}

.preview-panel small {
  margin-top: 4px;
  color: var(--muted);
}

.preview-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 12px 0;
}

.preview-counts span {
  padding: 5px 8px;
  color: #42536c;
  font-size: 0.75rem;
  background: #edf2f7;
  border-radius: 7px;
}

@media (max-width: 850px) {
  .backup-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 460px) {
  .count-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
