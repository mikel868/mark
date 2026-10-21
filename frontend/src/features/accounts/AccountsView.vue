<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useAuth } from '../../auth/auth-service'
import CopyField from '../../components/CopyField.vue'
import EntityState from '../../components/EntityState.vue'
import { dataService } from '../../data/data-service'
import { getAccountFields, getAccountLocationLabel } from '../../domain/account-fields'
import type { Account, EntityInput } from '../../domain/entities'
import { getPlatform, isPlatformId, type PlatformId } from '../../domain/platform'
import { accountInputSchema, firstValidationMessage } from '../../domain/validation'
import { copyText } from '../../utils/clipboard'
import AccountImportDialog from './AccountImportDialog.vue'

const route = useRoute()
const auth = useAuth()
const platformId = computed<PlatformId>(() =>
  isPlatformId(route.params.platform) ? route.params.platform : 'ins',
)
const platform = computed(() => getPlatform(platformId.value))
const accountFields = computed(() => getAccountFields(platformId.value))
const countryField = computed(() => accountFields.value.find((field) => field.key === 'country'))
const accountDetailFields = computed(() =>
  accountFields.value.filter((field) => field.key !== 'country'),
)
const locationLabel = computed(() => getAccountLocationLabel(platformId.value))
const accountDescription = computed(
  () => `集中管理账号与登录信息；按${locationLabel.value}筛选，按需查看和复制凭据。`,
)

const accounts = ref<Account[]>([])
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const dialogOpen = ref(false)
const importDialogOpen = ref(false)
const query = ref('')
const countryFilter = ref('')
const usageFilter = ref<'all' | 'unused' | 'used'>('all')
const usedSavingIds = ref<string[]>([])
const selectedAccounts = ref<Account[]>([])
const currentPage = ref(1)
const PAGE_SIZE = 10
const total = ref(0)
const accountCount = ref(0)
const usedCount = ref(0)
const unusedCount = computed(() => accountCount.value - usedCount.value)
const countries = ref<string[]>([])
let loadSequence = 0
let original: object | undefined

const emptyForm = () => ({
  id: '',
  used: false,
  country: '',
  account: '',
  password: '',
  emailAccount: '',
  emailPassword: '',
  token: '',
  decodeLink: '',
  twoFactor: '',
  note: '',
})

const form = reactive(emptyForm())

watch([query, countryFilter, usageFilter], () => {
  if (currentPage.value !== 1) currentPage.value = 1
  else void loadAccounts()
})
watch(currentPage, loadAccounts)

async function loadAccounts() {
  const request = ++loadSequence
  loading.value = true
  loadError.value = ''
  try {
    const [page, summary, options] = await Promise.all([
      dataService.accountsPage(platformId.value, {
        page: currentPage.value,
        pageSize: PAGE_SIZE,
        search: query.value.trim(),
        country: countryFilter.value,
        used: usageFilter.value === 'all' ? undefined : usageFilter.value === 'used',
      }),
      dataService.summary(platformId.value),
      dataService.filterOptions(platformId.value),
    ])
    if (request !== loadSequence) return
    accounts.value = page.items
    total.value = page.total
    accountCount.value = summary.accounts
    usedCount.value = summary.usedAccounts
    countries.value = options.accountCountries.filter(Boolean)
    selectedAccounts.value = []
    const lastPage = Math.max(1, Math.ceil(page.total / PAGE_SIZE))
    if (currentPage.value > lastPage) currentPage.value = lastPage
  } catch (error) {
    if (request !== loadSequence) return
    loadError.value = error instanceof Error ? error.message : '无法读取账号数据'
  } finally {
    if (request === loadSequence) loading.value = false
  }
}

function openCreate() {
  original = undefined
  Object.assign(form, emptyForm())
  dialogOpen.value = true
}

function openEdit(account: Account) {
  Object.assign(form, emptyForm(), account, { used: account.used ?? false })
  original = { ...form }
  dialogOpen.value = true
}

function openImport() {
  importDialogOpen.value = true
}

function resetFilters() {
  query.value = ''
  countryFilter.value = ''
  usageFilter.value = 'all'
}

async function save() {
  const input = {
    platformId: platformId.value,
    used: form.used,
    country: form.country,
    account: form.account,
    password: form.password,
    emailAccount: form.emailAccount,
    emailPassword: form.emailPassword,
    token: form.token,
    decodeLink: form.decodeLink,
    twoFactor: form.twoFactor,
    note: form.note,
  }
  const parsed = accountInputSchema.safeParse(input)
  if (!parsed.success) {
    ElMessage.warning(firstValidationMessage(parsed.error))
    return
  }

  saving.value = true
  try {
    await dataService.saveAccount(
      {
        ...parsed.data,
        id: form.id || undefined,
      } as EntityInput<Account>,
      original,
    )
    ElMessage.success(form.id ? '账号已更新' : '账号已添加')
    dialogOpen.value = false
    await loadAccounts()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function setUsed(account: Account, value: boolean | string | number) {
  const used = value === true
  if (!auth.canWrite.value || usedSavingIds.value.includes(account.id)) return

  usedSavingIds.value = [...usedSavingIds.value, account.id]
  try {
    const updated = await dataService.setAccountUsed(platformId.value, account.id, used)
    const index = accounts.value.findIndex((item) => item.id === account.id)
    if (index >= 0) accounts.value.splice(index, 1, updated)
    ElMessage.success(used ? '账号已标记为已失效' : '账号已标记为未使用')
    await loadAccounts()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新使用状态失败')
  } finally {
    usedSavingIds.value = usedSavingIds.value.filter((id) => id !== account.id)
  }
}

function updateSelectedAccounts(selection: Account[]) {
  selectedAccounts.value = selection
}

async function copySelectedAccounts() {
  const accountValues = selectedAccounts.value
    .map((account) => account.account.trim())
    .filter(Boolean)

  if (accountValues.length === 0) {
    ElMessage.info('所选记录暂无可复制的账号')
    return
  }

  try {
    await copyText(accountValues.join('\n'))
    ElMessage.success(`已复制 ${accountValues.length} 个账号`)
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function remove(account: Account) {
  try {
    await ElMessageBox.confirm(
      `确定删除账号“${account.account}”吗？关联的申诉历史、IP 和图片保留，但解除账号关联。`,
      '删除账号',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    await dataService.deleteAccount(platformId.value, account.id)
    ElMessage.success('账号已删除')
    await loadAccounts()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '操作失败')
    }
  }
}

onMounted(loadAccounts)
</script>

<template>
  <div>
    <div class="page-toolbar">
      <div class="page-title">
        <h1 :aria-label="`${platform.label} · 账号管理`">账号管理</h1>
        <p>{{ accountDescription }}</p>
      </div>
      <div class="toolbar-actions">
        <el-button :loading="loading" @click="loadAccounts">刷新</el-button>
        <template v-if="auth.canWrite.value">
          <el-button size="large" aria-label="批量导入" @click="openImport">导入账号</el-button>
          <el-button type="primary" size="large" aria-label="增加一行账号" @click="openCreate"
            >新增账号</el-button
          >
        </template>
      </div>
    </div>

    <div class="page-card filters">
      <el-input v-model="query" clearable :placeholder="`搜索账号、邮箱或${locationLabel}`" />
      <el-select v-model="countryFilter" clearable :placeholder="`全部${locationLabel}`">
        <el-option v-for="country in countries" :key="country" :label="country" :value="country" />
      </el-select>
      <el-select v-model="usageFilter" aria-label="按使用状态筛选">
        <el-option label="全部账号" value="all" />
        <el-option label="未使用" value="unused" />
        <el-option label="已失效" value="used" />
      </el-select>
      <el-button link type="primary" @click="resetFilters">重置</el-button>
    </div>

    <section class="page-card account-panel">
      <div class="account-summary">
        <button
          type="button"
          :class="{ active: usageFilter === 'all' }"
          @click="usageFilter = 'all'"
        >
          全部 {{ accountCount }}
        </button>
        <button
          type="button"
          :class="{ active: usageFilter === 'unused' }"
          @click="usageFilter = 'unused'"
        >
          未失效 {{ unusedCount }}
        </button>
        <button
          type="button"
          :class="{ active: usageFilter === 'used' }"
          @click="usageFilter = 'used'"
        >
          已失效 {{ usedCount }}
        </button>
        <span class="record-count">{{ total }} 条记录</span>
      </div>

      <div v-if="selectedAccounts.length" class="selection-actions">
        <span>已选择 {{ selectedAccounts.length }} 个账号</span>
        <el-button type="primary" plain @click="copySelectedAccounts">批量复制账号</el-button>
      </div>

      <EntityState
        :loading="loading"
        :error="loadError"
        :empty="!loading && !loadError && accounts.length === 0"
        empty-title="还没有账号"
        empty-description="添加第一条账号资料后，它会出现在这里。"
      >
        <template v-if="auth.canWrite.value">
          <el-button @click="openImport">从表格导入</el-button>
          <el-button type="primary" @click="openCreate">添加账号</el-button>
        </template>
        <template #error-action>
          <el-button @click="loadAccounts">重新加载</el-button>
        </template>
        <template #content>
          <el-table
            :data="accounts"
            stripe
            row-key="id"
            table-layout="fixed"
            empty-text="没有符合条件的账号"
            @selection-change="updateSelectedAccounts"
          >
            <el-table-column type="selection" width="44" fixed="left" />
            <el-table-column
              v-if="countryField"
              :label="countryField.label"
              :min-width="countryField.width"
              show-overflow-tooltip
            >
              <template #default="scope">{{ scope.row.country }}</template>
            </el-table-column>
            <el-table-column label="已失效" width="65" align="center">
              <template #default="scope">
                <el-checkbox
                  class="used-checkbox"
                  :model-value="scope.row.used === true"
                  aria-label="已失效"
                  :disabled="!auth.canWrite.value || usedSavingIds.includes(scope.row.id)"
                  @change="(value: boolean | string | number) => setUsed(scope.row, value)"
                />
              </template>
            </el-table-column>
            <el-table-column
              v-for="field in accountDetailFields"
              :key="field.key"
              :label="field.label"
              :min-width="field.width"
            >
              <template #default="scope">
                <CopyField :value="scope.row[field.key] ?? ''" :label="field.label" />
              </template>
            </el-table-column>
            <el-table-column v-if="auth.canWrite.value" label="操作" width="100">
              <template #default="scope">
                <el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button>
                <el-button link type="danger" @click="remove(scope.row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="total > PAGE_SIZE" class="account-pagination">
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="PAGE_SIZE"
              :total="total"
              background
              layout="prev, pager, next"
            />
          </div>
        </template>
      </EntityState>
    </section>

    <el-dialog
      v-if="auth.canWrite.value"
      v-model="dialogOpen"
      :title="form.id ? '编辑账号' : '新增账号'"
      width="min(680px, 94vw)"
      destroy-on-close
    >
      <el-form label-position="top" @submit.prevent="save">
        <div class="form-grid">
          <el-form-item
            v-for="field in accountFields"
            :key="field.key"
            :label="field.label"
            required
          >
            <el-input
              v-model="form[field.key]"
              :placeholder="field.key === 'country' ? `例如：${field.example}` : undefined"
              autocomplete="off"
            />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <AccountImportDialog
      v-if="auth.canWrite.value"
      v-model="importDialogOpen"
      :platform-id="platformId"
      :platform-label="platform.label"
      @imported="loadAccounts"
    />
  </div>
</template>

<style scoped>
.account-panel {
  overflow: hidden;
}

.account-summary {
  display: flex;
  gap: 24px;
  align-items: center;
  min-height: 64px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
}

.account-summary button {
  padding: 0;
  color: var(--muted);
  font-size: 14px;
  cursor: pointer;
  background: none;
  border: 0;
}

.account-summary button.active {
  color: var(--am-primary);
  font-weight: 500;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
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

.filters {
  display: grid;
  grid-template-columns: minmax(220px, 336px) 160px 160px auto;
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

.used-checkbox {
  min-width: 32px;
  justify-content: center;
}

.account-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 16px 18px;
  border-top: 1px solid var(--line);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 720px) {
  .filters,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .record-count {
    text-align: left;
  }

  .account-pagination {
    justify-content: center;
    overflow-x: auto;
  }

  .selection-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-actions .el-button {
    flex: 1;
  }
}
</style>
