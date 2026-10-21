<script setup lang="ts">
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import appealRecordIcon from '../../assets/figma/appeal-record.svg'
import emptyRecordsIllustration from '../../assets/figma/empty-records.svg'
import readErrorIllustration from '../../assets/figma/read-error.svg'
import { useAuth } from '../../auth/auth-service'
import EntityState from '../../components/EntityState.vue'
import { dataService, type AccountOption, type Summary } from '../../data/data-service'
import { downloadBlob } from '../../data/api-client'
import {
  appealStatuses,
  type Account,
  type AppealRecord,
  type AppealStatus,
  type EntityInput,
  type VerificationIpCredential,
} from '../../domain/entities'
import { getPlatform, isPlatformId, type PlatformId } from '../../domain/platform'
import {
  appealRecordInputSchema,
  firstValidationMessage,
  ipListSchema,
} from '../../domain/validation'
import { copyText } from '../../utils/clipboard'
import AppealRecordQuickImportDialog from './AppealRecordQuickImportDialog.vue'
import {
  buildAppealRecordCredentialBatchCopy,
  buildAppealRecordIpBatchCopy,
  type AppealRecordBatchCopyResult,
} from './appeal-record-batch-copy'
import { buildInstagramAppealTemplate, type InstagramTemplateNumber } from './instagram-template'
import RecordEvidenceImagesDialog from './RecordEvidenceImagesDialog.vue'
import { buildTikTokAppealTemplate, type TikTokTemplateNumber } from './tiktok-template'
import VerificationIpDialog from './VerificationIpDialog.vue'
import VerificationIpTableQuickImportDialog from './VerificationIpTableQuickImportDialog.vue'

type AppealTemplateNumber = InstagramTemplateNumber | TikTokTemplateNumber
const PROCESSING_STATUSES: ReadonlySet<AppealStatus> = new Set(['准备中', '已提交', '审核中'])
const COMPLETE_STATUSES: ReadonlySet<AppealStatus> = new Set(['部分完成', '申诉成功'])

const route = useRoute()
const auth = useAuth()
const platformId = computed<PlatformId>(() =>
  isPlatformId(route.params.platform) ? route.params.platform : 'ins',
)
const platform = computed(() => getPlatform(platformId.value))

const records = ref<AppealRecord[]>([])
const accounts = ref<Account[]>([])
const loading = ref(true)
const saving = ref(false)
const updatingIpRecordId = ref('')
const updatingVerificationRecordId = ref('')
const loadError = ref('')
const dialogOpen = ref(false)
const quickImportOpen = ref(false)
const verificationTableImportOpen = ref(false)
const verificationDialogOpen = ref(false)
const verificationDialogNetworks = ref<string[]>([])
const verificationDialogCredentials = ref<VerificationIpCredential[]>([])
const verificationDialogRecordId = ref('')
const verificationDialogSaving = ref(false)
const evidenceDialogOpen = ref(false)
const evidenceDialogRecord = ref<AppealRecord | null>(null)
const detailOpen = ref(false)
const detailRecordId = ref('')
const query = ref('')
const statusFilter = ref<AppealStatus | ''>('')
const statusGroup = ref<'all' | 'processing' | 'supplement' | 'complete'>('all')
const countryFilter = ref('')
const selectedRecords = ref<AppealRecord[]>([])
const recordsTable = ref<TableInstance>()
const batchStatus = ref<AppealStatus | ''>('')
const updatingSelectedStatus = ref(false)
const deletingSelectedRecords = ref(false)
const currentPage = ref(1)
const total = ref(0)
const PAGE_SIZE = 10
const countries = ref<string[]>([])
const summary = ref<Summary | null>(null)
const accountOptions = ref<AccountOption[]>([])
const accountOptionsTotal = ref(0)
const accountOptionsPage = ref(1)
const accountSearch = ref('')
const accountOptionsLoading = ref(false)
let optionSequence = 0
let loadSequence = 0
let original: Partial<AppealRecord> | undefined
let verificationOriginal: AppealRecord | undefined

const emptyForm = () => ({
  id: '',
  status: '准备中' as AppealStatus,
  country: '',
  ip: '',
  completedIps: [] as string[],
  verificationIps: [] as VerificationIpCredential[],
  appealedAt: toLocalDateTime(new Date()),
  appealPlatform: platform.value.label,
  accountId: '',
  note: '',
  template1: '',
  template2: '',
})

const form = reactive(emptyForm())

const processingCount = computed(
  () =>
    summary.value?.statuses
      .filter((item) => PROCESSING_STATUSES.has(item.status))
      .reduce((sum, s) => sum + s.count, 0) ?? 0,
)
const supplementCount = computed(
  () => summary.value?.statuses.find((item) => item.status === '需要补充')?.count ?? 0,
)
const completeCount = computed(
  () =>
    summary.value?.statuses
      .filter((item) => COMPLETE_STATUSES.has(item.status))
      .reduce((sum, s) => sum + s.count, 0) ?? 0,
)
const accountById = computed(() => new Map(accounts.value.map((item) => [item.id, item])))
const detailRecord = computed(
  () => records.value.find((record) => record.id === detailRecordId.value) ?? null,
)
const selectableAccounts = computed(() => {
  const options = [...accountOptions.value]
  const linked = accountById.value.get(form.accountId)
  if (linked && !options.some((a) => a.id === linked.id))
    options.unshift({ ...linked, appealCount: -1 })
  return options
})

watch([query, countryFilter, statusFilter, statusGroup], () => {
  if (currentPage.value !== 1) currentPage.value = 1
  else void load()
})
watch(currentPage, load)
watch(
  () => form.country,
  () => {
    if (dialogOpen.value) void searchAccounts('')
  },
)
async function searchAccounts(search: string) {
  accountSearch.value = search
  accountOptionsPage.value = 1
  await loadAccountOptions()
}
async function loadAccountOptions(more = false) {
  const request = ++optionSequence
  accountOptionsLoading.value = true
  const page = more ? accountOptionsPage.value + 1 : 1
  try {
    const result = await dataService.accountOptions(platformId.value, {
      page,
      pageSize: 50,
      country: form.country.trim(),
      search: accountSearch.value,
    })
    if (request !== optionSequence) return
    accountOptions.value = more ? [...accountOptions.value, ...result.items] : result.items
    accountOptionsTotal.value = result.total
    accountOptionsPage.value = page
  } catch (error) {
    if (request === optionSequence)
      ElMessage.error(error instanceof Error ? error.message : '读取账号选项失败')
  } finally {
    if (request === optionSequence) accountOptionsLoading.value = false
  }
}

function selectStatusGroup(group: typeof statusGroup.value) {
  statusGroup.value = group
  statusFilter.value = ''
}

function resetFilters() {
  query.value = ''
  statusFilter.value = ''
  countryFilter.value = ''
  statusGroup.value = 'all'
}

function openDetail(record: AppealRecord) {
  detailRecordId.value = record.id
  detailOpen.value = true
}

function editDetailRecord() {
  if (!detailRecord.value) return
  openEdit(detailRecord.value)
  detailOpen.value = false
}

function toLocalDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function statusType(status: AppealStatus) {
  if (status === '部分完成' || status === '申诉成功') return 'success'
  if (status === '申诉失败') return 'danger'
  if (status === '需要补充') return 'warning'
  if (status === '已关闭') return 'info'
  return 'primary'
}

function accountLabel(id?: string) {
  return (id ? accountById.value.get(id)?.account : undefined) ?? '未关联'
}

function accountOptionLabel(account: AccountOption) {
  const country = account.country.trim() || '未填写国家'
  return `${account.account} · ${country}${account.appealCount < 0 ? '' : ` · ${account.appealCount} 次申诉`}`
}

function recordIps(record: AppealRecord) {
  return record.ip.split('\n').filter(Boolean)
}

function isIpCompleted(record: AppealRecord, ip: string) {
  return (record.completedIps ?? []).includes(ip)
}

async function load() {
  const request = ++loadSequence
  loading.value = true
  loadError.value = ''
  try {
    const [page, counts, options] = await Promise.all([
      dataService.recordsPage(platformId.value, {
        page: currentPage.value,
        pageSize: PAGE_SIZE,
        search: query.value.trim(),
        country: countryFilter.value,
        status: statusFilter.value,
        statusGroup: statusGroup.value,
      }),
      dataService.summary(platformId.value),
      dataService.filterOptions(platformId.value),
    ])
    const ids = [...new Set(page.items.map((r) => r.accountId).filter((id): id is string => !!id))]
    const linked = await Promise.all(ids.map((id) => dataService.getAccount(platformId.value, id)))
    if (request !== loadSequence) return
    records.value = page.items
    accounts.value = linked
    total.value = page.total
    summary.value = counts
    countries.value = options.recordCountries.filter(Boolean)
    selectedRecords.value = []
    recordsTable.value?.clearSelection()
    batchStatus.value = ''
    const last = Math.max(1, Math.ceil(page.total / PAGE_SIZE))
    if (currentPage.value > last) currentPage.value = last
  } catch (error) {
    if (request !== loadSequence) return
    loadError.value = error instanceof Error ? error.message : '无法读取申诉记录'
  } finally {
    if (request === loadSequence) loading.value = false
  }
}

function openCreate() {
  original = undefined
  Object.assign(form, emptyForm())
  dialogOpen.value = true
  void searchAccounts('')
}

function openEdit(record: AppealRecord) {
  Object.assign(form, {
    id: record.id,
    status: record.status,
    country: record.country,
    ip: record.ip,
    appealedAt: toLocalDateTime(new Date(record.appealedAt)),
    completedIps: [...(record.completedIps ?? [])],
    verificationIps: (record.verificationIps ?? []).map((item) => ({ ...item })),
    appealPlatform: record.appealPlatform,
    accountId: record.accountId ?? '',
    note: record.note,
    template1: record.template1,
    template2: record.template2,
  })
  original = { ...form, appealedAt: new Date(form.appealedAt).toISOString() }
  dialogOpen.value = true
  void searchAccounts('')
}

function openRecordVerificationDialog(record: AppealRecord) {
  verificationOriginal = {
    ...record,
    ipItems: record.ipItems?.map((i) => ({ ...i })),
    verificationIps: record.verificationIps?.map((i) => ({ ...i })),
    completedIps: [...(record.completedIps ?? [])],
  }
  verificationDialogNetworks.value = recordIps(record)
  verificationDialogCredentials.value = (record.verificationIps ?? []).map((item) => ({ ...item }))
  verificationDialogRecordId.value = record.id
  verificationDialogSaving.value = false
  verificationDialogOpen.value = true
}

function openEvidenceImagesDialog(record: AppealRecord) {
  evidenceDialogRecord.value = record
  evidenceDialogOpen.value = true
}

async function saveVerificationIps(credentials: VerificationIpCredential[]) {
  const recordId = verificationDialogRecordId.value
  const record = verificationOriginal
  if (!record) {
    ElMessage.error('要编辑的申诉记录不存在或已经被删除')
    return
  }

  verificationDialogSaving.value = true
  updatingVerificationRecordId.value = recordId
  try {
    await dataService.saveVerificationIps(
      platformId.value,
      record,
      verificationDialogCredentials.value,
      credentials,
    )
    verificationDialogOpen.value = false
    ElMessage.success('验证 IP 已保存')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '验证 IP 保存失败')
  } finally {
    verificationDialogSaving.value = false
    updatingVerificationRecordId.value = ''
  }
}

async function save() {
  if (saving.value) return
  const parsedIps = ipListSchema.safeParse(form.ip)
  if (!parsedIps.success) {
    ElMessage.warning(firstValidationMessage(parsedIps.error))
    return
  }
  const currentNetworks = new Set(parsedIps.data.split('\n'))
  const input = {
    platformId: platformId.value,
    status: form.status,
    country: form.country,
    ip: parsedIps.data,
    completedIps: form.completedIps,
    verificationIps: form.verificationIps.filter((item) => currentNetworks.has(item.network)),
    appealedAt: form.appealedAt,
    appealPlatform: form.appealPlatform,
    accountId: form.accountId || undefined,
    note: form.note,
    template1: form.template1,
    template2: form.template2,
  }
  const parsed = appealRecordInputSchema.safeParse(input)
  if (!parsed.success) {
    ElMessage.warning(firstValidationMessage(parsed.error))
    return
  }

  saving.value = true
  const editingId = form.id
  const openingSnapshot = original
  try {
    const removedIps = (openingSnapshot?.ip?.split('\n').filter(Boolean) ?? []).filter(
      (ip) => !currentNetworks.has(ip),
    )
    if (removedIps.length)
      await ElMessageBox.confirm(
        `以下 IP 将被移除，其完成标记和验证账密会一并删除：${removedIps.join('、')}。是否继续？`,
        '确认移除 IP',
        { confirmButtonText: '移除并保存', cancelButtonText: '取消', type: 'warning' },
      )
    await dataService.saveRecord(
      {
        ...parsed.data,
        appealedAt: new Date(parsed.data.appealedAt).toISOString(),
        id: editingId || undefined,
      } as EntityInput<AppealRecord>,
      openingSnapshot,
    )
    ElMessage.success(form.id ? '申诉记录已更新' : '申诉记录已添加')
    dialogOpen.value = false
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(record: AppealRecord) {
  try {
    await ElMessageBox.confirm('删除后无法恢复，确定继续吗？', '删除申诉记录', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await dataService.deleteRecord(platformId.value, record.id)
    ElMessage.success('申诉记录已删除')
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '删除失败')
    }
  }
}

async function toggleIpCompleted(record: AppealRecord, ip: string, event: Event) {
  if (!auth.canWrite.value || updatingIpRecordId.value) return

  const checkbox = event.currentTarget as HTMLInputElement
  updatingIpRecordId.value = record.id
  try {
    await dataService.setIpCompleted(platformId.value, record, ip, checkbox.checked)
    // Reload the current filter/page instead of replacing a pre-request array index.
    await load()
  } catch (error) {
    checkbox.checked = record.completedIps?.includes(ip) ?? false
    ElMessage.error(error instanceof Error ? error.message : 'IP 标记保存失败')
  } finally {
    updatingIpRecordId.value = ''
  }
}

async function copyTemplate(record: AppealRecord, template: AppealTemplateNumber) {
  const label = `模板 ${template}`
  let value = template === 1 ? record.template1 : template === 2 ? record.template2 : ''

  if (record.platformId === 'ins' || record.platformId === 'tiktok') {
    try {
      const account = record.accountId ? accountById.value.get(record.accountId) : undefined
      if (record.platformId === 'ins') {
        value = buildInstagramAppealTemplate({
          template,
          country: record.country,
          ip: record.ip,
          account,
          nameKey: account?.id ?? record.id,
        })
      } else if (template === 1 || template === 2) {
        value = buildTikTokAppealTemplate({
          template,
          country: record.country,
          ip: record.ip,
          account,
        })
      }
    } catch (error) {
      ElMessage.warning(error instanceof Error ? error.message : `${label}生成失败`)
      return
    }
  }

  if (!value) {
    ElMessage.info(`${label}暂无内容`)
    return
  }
  try {
    await copyText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function copyRecordIps(record: AppealRecord) {
  try {
    await copyText(record.ip)
    ElMessage.success('IP 已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

function updateSelectedRecords(selection: AppealRecord[]) {
  selectedRecords.value = selection
  if (selection.length === 0) batchStatus.value = ''
}

async function copySelectedRecordData(
  result: AppealRecordBatchCopyResult,
  label: 'IP' | 'IP 账密',
) {
  if (!result.count) {
    ElMessage.info(`所选记录暂无可复制的 ${label}`)
    return
  }

  try {
    await copyText(result.text)
    ElMessage.success(`已复制 ${result.count} ${label === 'IP' ? '个 IP' : '条 IP 账密'}`)
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

function copySelectedIps() {
  return copySelectedRecordData(buildAppealRecordIpBatchCopy(selectedRecords.value), 'IP')
}

function copySelectedCredentials() {
  return copySelectedRecordData(
    buildAppealRecordCredentialBatchCopy(selectedRecords.value),
    'IP 账密',
  )
}

async function updateSelectedRecordStatuses() {
  const selectedIds = selectedRecords.value.map((record) => record.id)
  const status = batchStatus.value
  if (
    !auth.canWrite.value ||
    selectedIds.length === 0 ||
    !status ||
    updatingSelectedStatus.value ||
    deletingSelectedRecords.value
  ) {
    return
  }

  updatingSelectedStatus.value = true
  try {
    const result = await dataService.updateRecordStatuses(platformId.value, selectedIds, status)
    recordsTable.value?.clearSelection()
    selectedRecords.value = []
    batchStatus.value = ''
    ElMessage.success(`已将 ${result.count} 条申诉记录修改为“${status}”`)
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量修改状态失败')
  } finally {
    updatingSelectedStatus.value = false
  }
}

async function removeSelectedRecords() {
  const selectedIds = selectedRecords.value.map((record) => record.id)
  if (!auth.canWrite.value || selectedIds.length === 0 || deletingSelectedRecords.value) return

  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedIds.length} 条申诉记录吗？删除后无法恢复。`,
      '批量删除申诉记录',
      {
        confirmButtonText: `删除 ${selectedIds.length} 条`,
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    deletingSelectedRecords.value = true
    const deletedCount = await dataService.deleteRecords(platformId.value, selectedIds)
    ElMessage.success(`已删除 ${deletedCount} 条申诉记录`)
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '批量删除失败')
    }
  } finally {
    deletingSelectedRecords.value = false
  }
}

async function exportCompletedIps() {
  try {
    const blob = await dataService.exportCompletedIps(platformId.value)
    const lines = (await blob.text())
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(Boolean)
    if (lines.length === 0) {
      ElMessage.info('暂无已勾选的 IP')
      return
    }
    downloadBlob(
      blob,
      `${platformId.value}-completed-ips-${new Date().toISOString().slice(0, 10)}.tsv`,
    )
    ElMessage.success(`已导出 ${lines.length} 个已勾选 IP`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败')
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-toolbar">
      <div class="page-title">
        <h1 class="records-heading" :aria-label="`${platform.label} · 申诉记录`">
          <img :src="appealRecordIcon" alt="" width="24" height="24" />
          申诉记录
        </h1>
        <p>追踪各地区申诉进展，统一管理 IP、证据与模板。</p>
      </div>
      <div class="toolbar-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <template v-if="auth.canWrite.value">
          <el-button size="large" @click="quickImportOpen = true">快速导入</el-button>
          <el-button
            size="large"
            :disabled="!summary?.appealRecords"
            @click="verificationTableImportOpen = true"
          >
            IP 账密导入
          </el-button>
          <el-button type="primary" size="large" aria-label="增加一行记录" @click="openCreate"
            >创建申诉记录</el-button
          >
        </template>
      </div>
    </div>

    <div class="page-card filters">
      <el-input v-model="query" clearable placeholder="搜索账号、国家、IP 或申诉平台" />
      <el-select v-model="countryFilter" clearable placeholder="全部国家">
        <el-option v-for="country in countries" :key="country" :label="country" :value="country" />
      </el-select>
      <el-select
        v-model="statusFilter"
        clearable
        placeholder="全部状态"
        @change="statusGroup = 'all'"
      >
        <el-option v-for="status in appealStatuses" :key="status" :label="status" :value="status" />
      </el-select>
      <el-button link type="primary" @click="resetFilters">重置</el-button>
    </div>

    <section class="page-card records-panel">
      <div class="record-summary">
        <button
          type="button"
          :class="{ active: statusGroup === 'all' }"
          @click="selectStatusGroup('all')"
        >
          全部 {{ summary?.appealRecords ?? 0 }}
        </button>
        <button
          type="button"
          :class="{ active: statusGroup === 'processing' }"
          @click="selectStatusGroup('processing')"
        >
          处理中 {{ processingCount }}
        </button>
        <button
          type="button"
          :class="{ active: statusGroup === 'supplement' }"
          @click="selectStatusGroup('supplement')"
        >
          需补充 {{ supplementCount }}
        </button>
        <button
          type="button"
          :class="{ active: statusGroup === 'complete' }"
          @click="selectStatusGroup('complete')"
        >
          已完成 {{ completeCount }}
        </button>
        <span class="record-count">{{ total }} 条</span>
        <el-button link type="primary" :disabled="loading" @click="exportCompletedIps"
          >导出已勾选 IP</el-button
        >
      </div>

      <div v-if="selectedRecords.length" class="selection-actions">
        <span>已选择 {{ selectedRecords.length }} 条申诉记录</span>
        <div class="selection-action-buttons">
          <el-button type="primary" plain @click="copySelectedIps">批量复制 IP</el-button>
          <el-button type="success" plain @click="copySelectedCredentials">
            批量复制 IP 账密
          </el-button>
          <el-select
            v-if="auth.canWrite.value"
            v-model="batchStatus"
            class="batch-status-select"
            aria-label="批量状态"
            placeholder="选择状态"
            :disabled="updatingSelectedStatus || deletingSelectedRecords"
          >
            <el-option
              v-for="status in appealStatuses"
              :key="status"
              :label="status"
              :value="status"
            />
          </el-select>
          <el-button
            v-if="auth.canWrite.value"
            type="warning"
            plain
            :disabled="!batchStatus || deletingSelectedRecords"
            :loading="updatingSelectedStatus"
            @click="updateSelectedRecordStatuses"
          >
            批量修改状态
          </el-button>
          <el-button
            v-if="auth.canWrite.value"
            type="danger"
            plain
            :disabled="updatingSelectedStatus"
            :loading="deletingSelectedRecords"
            @click="removeSelectedRecords"
          >
            批量删除
          </el-button>
        </div>
      </div>

      <EntityState
        :loading="loading"
        :error="loadError"
        :empty="!loading && !loadError && records.length === 0"
        :empty-title="summary?.appealRecords === 0 ? '还没有申诉记录' : '没有符合条件的记录'"
        :empty-description="
          summary?.appealRecords === 0
            ? '建立第一条记录后即可持续更新申诉状态。'
            : '请调整筛选条件，或重置后查看全部记录。'
        "
        :empty-image="summary?.appealRecords === 0 ? emptyRecordsIllustration : undefined"
        :error-image="readErrorIllustration"
        error-title="暂时无法读取记录"
      >
        <div v-if="auth.canWrite.value" class="empty-actions">
          <el-button @click="quickImportOpen = true">从网段导入</el-button>
          <el-button type="primary" @click="openCreate">创建申诉记录</el-button>
        </div>
        <template #error-action><el-button @click="load">重新加载</el-button></template>
        <template #content>
          <el-table
            ref="recordsTable"
            :data="records"
            stripe
            row-key="id"
            empty-text="没有符合条件的记录"
            @selection-change="updateSelectedRecords"
          >
            <el-table-column type="selection" width="52" fixed="left" />
            <el-table-column label="状态" width="90">
              <template #default="scope">
                <el-tag :type="statusType(scope.row.status)">{{ scope.row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="country" label="国家" min-width="80" />
            <el-table-column label="IP / 网络" min-width="175">
              <template #default="scope">
                <div class="ip-list">
                  <label
                    v-for="ip in recordIps(scope.row)"
                    :key="ip"
                    class="ip-item"
                    :class="{ 'is-completed': isIpCompleted(scope.row, ip) }"
                  >
                    <input
                      type="checkbox"
                      :checked="isIpCompleted(scope.row, ip)"
                      :disabled="!auth.canWrite.value || updatingIpRecordId === scope.row.id"
                      :aria-label="`标记 IP ${ip} 为完成`"
                      @change="toggleIpCompleted(scope.row, ip, $event)"
                    />
                    <span>{{ ip }}</span>
                  </label>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="关联账号" min-width="130">
              <template #default="scope">
                <div class="record-account-cell">
                  <span>{{ accountLabel(scope.row.accountId) }}</span>
                  <small>{{
                    accountById.get(scope.row.accountId)?.emailAccount || '未关联邮箱'
                  }}</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="申诉时间" min-width="135">
              <template #default="scope">
                <div class="record-date-cell">
                  <span>{{ new Date(scope.row.appealedAt).toLocaleString('zh-CN') }}</span>
                  <small>{{ scope.row.appealPlatform }}</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="验证 IP" min-width="115">
              <template #default="scope">
                <div class="verification-actions">
                  <el-button
                    link
                    type="primary"
                    :disabled="updatingVerificationRecordId === scope.row.id"
                    :aria-label="`查看 ${scope.row.country} 的 IP 账密`"
                    @click="openRecordVerificationDialog(scope.row)"
                    >查看 IP 账密</el-button
                  >
                </div>
              </template>
            </el-table-column>
            <el-table-column label="模板复制" min-width="160">
              <template #default="scope">
                <div class="template-actions">
                  <el-button
                    link
                    type="primary"
                    aria-label="复制 1"
                    @click="copyTemplate(scope.row, 1)"
                    >模板一</el-button
                  >
                  <el-button
                    link
                    type="primary"
                    aria-label="复制 2"
                    @click="copyTemplate(scope.row, 2)"
                    >模板二</el-button
                  >
                  <el-button
                    v-if="platformId === 'ins'"
                    link
                    type="primary"
                    aria-label="复制 3"
                    @click="copyTemplate(scope.row, 3)"
                    >模板三</el-button
                  >
                </div>
              </template>
            </el-table-column>
            <el-table-column label="证据" width="75">
              <template #default="scope">
                <div class="evidence-actions">
                  <el-button
                    link
                    type="primary"
                    :aria-label="`管理 ${scope.row.country} 的验证证据图片`"
                    @click="openEvidenceImagesDialog(scope.row)"
                    >证据</el-button
                  >
                </div>
              </template>
            </el-table-column>
            <el-table-column label="快捷操作" width="150" fixed="right">
              <template #default="scope">
                <div class="quick-actions">
                  <el-button link type="primary" @click="openDetail(scope.row)">详情</el-button>
                  <el-button link type="primary" @click="copyRecordIps(scope.row)"
                    >复制 IP</el-button
                  >
                  <template v-if="auth.canWrite.value">
                    <el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button>
                    <el-button link type="danger" @click="remove(scope.row)">删除</el-button>
                  </template>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-if="total > PAGE_SIZE"
            v-model:current-page="currentPage"
            :page-size="PAGE_SIZE"
            :total="total"
            layout="total, prev, pager, next"
            style="padding: 16px"
          />
        </template>
      </EntityState>
    </section>

    <el-drawer
      v-model="detailOpen"
      class="record-detail-drawer"
      direction="rtl"
      size="min(592px, 100vw)"
      :with-header="false"
    >
      <div v-if="detailRecord" class="record-detail">
        <div class="detail-heading">
          <span>申诉记录 / 详情</span>
          <el-button link type="primary" @click="detailOpen = false">关闭</el-button>
        </div>
        <h2>{{ detailRecord.country }}地区申诉</h2>
        <div class="detail-meta">
          <el-tag :type="statusType(detailRecord.status)">{{ detailRecord.status }}</el-tag>
          <small>申诉时间 {{ new Date(detailRecord.appealedAt).toLocaleString('zh-CN') }}</small>
        </div>

        <section class="detail-section">
          <h3>申诉信息</h3>
          <p>
            国家 / 地区：{{ detailRecord.country }} · 申诉平台：{{ detailRecord.appealPlatform }}
          </p>
          <p>关联账号：{{ accountLabel(detailRecord.accountId) }}</p>
        </section>

        <section class="detail-section detail-ip-section">
          <div class="detail-section-heading">
            <h3>申诉 IP · {{ recordIps(detailRecord).length }} 个</h3>
            <el-button link type="primary" @click="copyRecordIps(detailRecord)">复制全部</el-button>
          </div>
          <div class="ip-list">
            <label
              v-for="ip in recordIps(detailRecord)"
              :key="ip"
              class="ip-item"
              :class="{ 'is-completed': isIpCompleted(detailRecord, ip) }"
            >
              <input
                type="checkbox"
                :checked="isIpCompleted(detailRecord, ip)"
                :disabled="!auth.canWrite.value || updatingIpRecordId === detailRecord.id"
                :aria-label="`标记 IP ${ip} 为完成`"
                @change="toggleIpCompleted(detailRecord, ip, $event)"
              />
              <span>{{ ip }}</span>
            </label>
          </div>
        </section>

        <section class="detail-section">
          <div class="detail-section-heading">
            <h3>验证信息</h3>
            <el-button link type="primary" @click="openRecordVerificationDialog(detailRecord)"
              >管理验证 IP</el-button
            >
          </div>
          <p>已填写 {{ detailRecord.verificationIps?.length ?? 0 }} 条验证 IP 账密。</p>
        </section>

        <section class="detail-section">
          <div class="detail-section-heading">
            <h3>证据图片</h3>
            <el-button link type="primary" @click="openEvidenceImagesDialog(detailRecord)"
              >管理证据</el-button
            >
          </div>
          <p>查看、添加或移除与本条记录相关的验证证据。</p>
        </section>

        <section class="detail-section">
          <h3>备注</h3>
          <p>{{ detailRecord.note || '暂无备注' }}</p>
        </section>

        <div class="detail-footer">
          <el-button v-if="auth.canWrite.value" @click="editDetailRecord">编辑记录</el-button>
          <el-button @click="copyTemplate(detailRecord, 1)">复制模板一</el-button>
          <el-button @click="copyTemplate(detailRecord, 2)">复制模板二</el-button>
          <el-button
            v-if="platformId === 'ins'"
            type="primary"
            @click="copyTemplate(detailRecord, 3)"
            >复制模板三</el-button
          >
        </div>
      </div>
    </el-drawer>

    <el-dialog
      v-if="auth.canWrite.value"
      v-model="dialogOpen"
      :title="form.id ? '编辑申诉记录' : '新增申诉记录'"
      width="min(820px, 96vw)"
      top="4vh"
    >
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="状态" required>
            <el-select v-model="form.status">
              <el-option
                v-for="status in appealStatuses"
                :key="status"
                :label="status"
                :value="status"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="国家" required><el-input v-model="form.country" /></el-form-item>
          <el-form-item label="IP 地址或网段（每行一个）" required>
            <el-input
              v-model="form.ip"
              type="textarea"
              :rows="4"
              resize="vertical"
              :placeholder="'每行输入一个 IPv4、IPv6 地址或 CIDR 网段，例如：\n1.1.1.1\n194.179.156.0/24\n2001:db8::/32'"
            />
          </el-form-item>
          <el-form-item label="申诉时间" required>
            <el-input v-model="form.appealedAt" type="datetime-local" />
          </el-form-item>
          <el-form-item label="申诉平台" required>
            <el-input v-model="form.appealPlatform" />
          </el-form-item>
          <el-form-item label="关联账号">
            <el-select
              v-model="form.accountId"
              clearable
              filterable
              remote
              :remote-method="searchAccounts"
              :loading="accountOptionsLoading"
              placeholder="可输入账号搜索"
            >
              <el-option
                v-for="account in selectableAccounts"
                :key="account.id"
                :label="accountOptionLabel(account)"
                :value="account.id"
              />
              <template #footer
                ><el-button
                  v-if="accountOptions.length < accountOptionsTotal"
                  :loading="accountOptionsLoading"
                  @click="loadAccountOptions(true)"
                  >加载更多账号</el-button
                ></template
              >
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" />
        </el-form-item>
        <el-alert
          v-if="platformId === 'ins'"
          class="fixed-template-notice"
          type="info"
          :closable="false"
          show-icon
          title="INS 模板已固定"
          description="模板 1 自动带入国家、关联账号、注册邮箱、英文姓名和 IP；模板 2 自动带入国家、英文姓名和 IP；模板 3 自动带入国家、关联账号、注册邮箱和 IP。同一账号的模板 1、2 使用相同姓名。"
        />
        <el-alert
          v-else-if="platformId === 'tiktok'"
          class="fixed-template-notice"
          type="info"
          :closable="false"
          show-icon
          title="TikTok 模板已固定"
          description="模板 1 使用 tiktok-ip-geolocation-appeal，模板 2 使用 tiktok-ip-geolocation-appeal2；两个模板都会自动带入正确国家、关联账号的 TikTok 用户名、联系邮箱和当前记录的全部 IP。"
        />
        <div v-else class="template-grid">
          <el-form-item label="模板 1">
            <el-input v-model="form.template1" type="textarea" :rows="7" />
          </el-form-item>
          <el-form-item label="模板 2">
            <el-input v-model="form.template2" type="textarea" :rows="7" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <AppealRecordQuickImportDialog
      v-if="auth.canWrite.value"
      v-model="quickImportOpen"
      :platform-id="platformId"
      :platform-label="platform.label"
      @imported="load"
    />

    <VerificationIpTableQuickImportDialog
      v-if="auth.canWrite.value"
      v-model="verificationTableImportOpen"
      :platform-id="platformId"
      :platform-label="platform.label"
      @imported="load"
    />

    <VerificationIpDialog
      v-model="verificationDialogOpen"
      :networks="verificationDialogNetworks"
      :credentials="verificationDialogCredentials"
      :readonly="!auth.canWrite.value"
      :saving="verificationDialogSaving"
      @save="saveVerificationIps"
    />

    <RecordEvidenceImagesDialog
      v-model="evidenceDialogOpen"
      :platform-id="platformId"
      :record="evidenceDialogRecord"
      :readonly="!auth.canWrite.value"
    />
  </div>
</template>

<style scoped>
.records-heading {
  display: flex;
  gap: 10px;
  align-items: center;
}

.records-heading img {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
}

.records-panel {
  overflow: hidden;
}

.record-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
  min-height: 64px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
}

.record-summary button:not(.el-button) {
  padding: 0;
  color: var(--muted);
  font-size: 14px;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.record-summary button.active {
  color: var(--am-primary);
  font-weight: 500;
}

.record-summary > .el-button {
  margin-left: 0;
}

.toolbar-actions,
.empty-actions,
.selection-action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.empty-actions {
  justify-content: center;
}

.empty-actions > .el-button + .el-button {
  margin-left: 0;
}

.selection-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  color: var(--navy);
  background: var(--teal-soft);
  border-bottom: 1px solid var(--line);
}

.selection-actions > span {
  font-weight: 600;
}

.batch-status-select {
  width: 150px;
}

.filters {
  display: grid;
  grid-template-columns: minmax(240px, 336px) 160px 160px auto;
  gap: 12px;
  align-items: center;
  min-height: 72px;
  padding: 16px;
  margin-bottom: 16px;
}

.record-count {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
  text-align: right;
}

.record-account-cell,
.record-date-cell {
  display: grid;
  min-width: 0;
}

.record-account-cell span,
.record-account-cell small,
.record-date-cell span,
.record-date-cell small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-account-cell small,
.record-date-cell small {
  color: var(--muted);
  font-size: 12px;
}

.template-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
  align-items: center;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  justify-items: start;
}

.quick-actions .el-button,
.template-actions .el-button,
.evidence-actions .el-button,
.verification-actions .el-button {
  min-height: 26px;
  margin: 0;
  padding: 0 4px;
  font-size: 12px;
}

.record-detail {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 12px;
}

.detail-heading,
.detail-section-heading,
.detail-meta,
.detail-footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.detail-heading span {
  color: var(--muted);
  font-size: 12px;
}

.record-detail h2 {
  margin: 8px 0 16px;
  color: var(--navy);
  font-size: 24px;
  line-height: 34px;
}

.detail-meta {
  justify-content: flex-start;
  margin-bottom: 24px;
}

.detail-meta small,
.detail-section p {
  color: var(--muted);
  font-size: 13px;
  line-height: 22px;
}

.detail-section {
  margin-bottom: 22px;
}

.detail-section h3 {
  margin: 0 0 12px;
  color: var(--navy);
  font-size: 14px;
  font-weight: 500;
}

.detail-section p {
  margin: 0 0 4px;
  white-space: pre-wrap;
}

.detail-ip-section {
  padding: 16px;
  background: var(--am-bg);
  border-radius: 8px;
}

.detail-section-heading h3 {
  margin-bottom: 0;
}

.detail-ip-section .ip-list {
  margin-top: 12px;
}

.detail-footer {
  flex-wrap: wrap;
  justify-content: flex-start;
  padding-top: 16px;
  margin-top: auto;
  background: #fff;
  border-top: 1px solid var(--line);
}

.detail-footer .el-button {
  margin-left: 0;
}

.ip-list {
  display: grid;
  gap: 4px;
}

.ip-item {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  min-width: 0;
  padding: 3px 6px;
  border-radius: 6px;
  line-height: 1.45;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.ip-item input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #2f9e68;
  cursor: pointer;
}

.ip-item input:disabled {
  cursor: default;
}

.ip-item span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ip-item.is-completed {
  color: #18794e;
  background-color: #e8f7ef;
}

.fixed-template-notice {
  margin-top: 4px;
}

.form-grid,
.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 760px) {
  .filters,
  .form-grid,
  .template-grid {
    grid-template-columns: 1fr;
  }

  .record-count {
    text-align: left;
  }

  .selection-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .selection-action-buttons .el-button {
    flex: 1;
  }

  .batch-status-select {
    width: 100%;
  }
}
</style>
