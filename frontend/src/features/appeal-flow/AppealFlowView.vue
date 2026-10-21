<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useAuth } from '../../auth/auth-service'
import EntityState from '../../components/EntityState.vue'
import { dataService } from '../../data/data-service'
import type { AppealModule, AppealStep, EntityInput } from '../../domain/entities'
import { getPlatform, isPlatformId, type PlatformId } from '../../domain/platform'
import {
  appealModuleInputSchema,
  appealStepInputSchema,
  firstValidationMessage,
} from '../../domain/validation'

const route = useRoute()
const auth = useAuth()
const platformId = computed<PlatformId>(() =>
  isPlatformId(route.params.platform) ? route.params.platform : 'ins',
)
const platform = computed(() => getPlatform(platformId.value))

const modules = ref<AppealModule[]>([])
const steps = ref<AppealStep[]>([])
const selectedModuleId = ref('')
const loading = ref(true)
const loadError = ref('')
const moduleDialogOpen = ref(false)
const stepDialogOpen = ref(false)
const saving = ref(false)
let moduleOriginal: AppealModule | undefined
let stepOriginal: AppealStep | undefined
let loadSequence = 0

const moduleForm = reactive({
  id: '',
  name: '',
  description: '',
  enabled: true,
  note: '',
})

const stepForm = reactive({
  id: '',
  name: '',
  instructions: '',
  note: '',
})

const selectedModule = computed(
  () => modules.value.find((item) => item.id === selectedModuleId.value) ?? null,
)
const selectedSteps = computed(() =>
  steps.value
    .filter((step) => step.moduleId === selectedModuleId.value)
    .sort((left, right) => left.sortOrder - right.sortOrder),
)

async function load() {
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = ''
  try {
    const [loadedModules, loadedSteps] = await Promise.all([
      dataService.listModules(platformId.value),
      dataService.listSteps(platformId.value),
    ])
    if (sequence !== loadSequence) return
    modules.value = loadedModules
    steps.value = loadedSteps
    if (!modules.value.some((item) => item.id === selectedModuleId.value)) {
      selectedModuleId.value = modules.value[0]?.id ?? ''
    }
  } catch (error) {
    if (sequence !== loadSequence) return
    loadError.value = error instanceof Error ? error.message : '无法读取申诉流程'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

function openCreateModule() {
  moduleOriginal = undefined
  Object.assign(moduleForm, { id: '', name: '', description: '', enabled: true, note: '' })
  moduleDialogOpen.value = true
}

function openEditModule(module: AppealModule) {
  moduleOriginal = { ...module }
  Object.assign(moduleForm, module)
  moduleDialogOpen.value = true
}

async function saveModule() {
  const input = {
    platformId: platformId.value,
    name: moduleForm.name,
    description: moduleForm.description,
    enabled: moduleForm.enabled,
    sortOrder: moduleOriginal?.sortOrder ?? modules.value.length,
    note: moduleForm.note,
  }
  const parsed = appealModuleInputSchema.safeParse(input)
  if (!parsed.success) {
    ElMessage.warning(firstValidationMessage(parsed.error))
    return
  }
  saving.value = true
  try {
    const saved = await dataService.saveModule(
      {
        ...parsed.data,
        id: moduleForm.id || undefined,
      } as EntityInput<AppealModule>,
      moduleOriginal,
    )
    moduleDialogOpen.value = false
    selectedModuleId.value = saved.id
    ElMessage.success(moduleForm.id ? '模块已更新' : '模块已添加')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function removeModule(module: AppealModule) {
  try {
    const hasSteps = steps.value.some((step) => step.moduleId === module.id)
    const referenced = await dataService.isReferenced(platformId.value, 'module', module.id)
    if (hasSteps || referenced) {
      await ElMessageBox.confirm('这个模块已有步骤或申诉记录，将改为归档。是否继续？', '归档模块', {
        confirmButtonText: '归档',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await dataService.archive(platformId.value, 'module', module.id)
      ElMessage.success('模块已归档')
    } else {
      await ElMessageBox.confirm(`确定删除模块“${module.name}”吗？`, '删除模块', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await dataService.deleteModule(platformId.value, module.id)
      ElMessage.success('模块已删除')
    }
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '操作失败')
    }
  }
}

function openCreateStep() {
  stepOriginal = undefined
  if (!selectedModule.value) return
  Object.assign(stepForm, { id: '', name: '', instructions: '', note: '' })
  stepDialogOpen.value = true
}

function openEditStep(step: AppealStep) {
  stepOriginal = { ...step }
  Object.assign(stepForm, step)
  stepDialogOpen.value = true
}

async function saveStep() {
  if (!selectedModule.value) return
  const input = {
    platformId: platformId.value,
    moduleId: stepOriginal?.moduleId ?? selectedModule.value.id,
    name: stepForm.name,
    instructions: stepForm.instructions,
    sortOrder: stepOriginal?.sortOrder ?? selectedSteps.value.length,
    note: stepForm.note,
  }
  const parsed = appealStepInputSchema.safeParse(input)
  if (!parsed.success) {
    ElMessage.warning(firstValidationMessage(parsed.error))
    return
  }
  saving.value = true
  try {
    await dataService.saveStep(
      {
        ...parsed.data,
        id: stepForm.id || undefined,
      } as EntityInput<AppealStep>,
      stepOriginal,
    )
    stepDialogOpen.value = false
    ElMessage.success(stepForm.id ? '步骤已更新' : '步骤已添加')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function removeStep(step: AppealStep) {
  try {
    const referenced = await dataService.isReferenced(platformId.value, 'step', step.id)
    if (referenced) {
      await ElMessageBox.confirm('这个步骤已被申诉记录引用，只能归档。是否继续？', '归档步骤', {
        confirmButtonText: '归档',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await dataService.archive(platformId.value, 'step', step.id)
    } else {
      await ElMessageBox.confirm(`确定删除步骤“${step.name}”吗？`, '删除步骤', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await dataService.deleteStep(platformId.value, step.id)
    }
    ElMessage.success(referenced ? '步骤已归档' : '步骤已删除')
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '操作失败')
    }
  }
}

async function moveStep(step: AppealStep, direction: -1 | 1) {
  const currentIndex = selectedSteps.value.findIndex((item) => item.id === step.id)
  const target = selectedSteps.value[currentIndex + direction]
  if (!target) return

  try {
    await dataService.swapStepOrder(platformId.value, step.id, target.id)
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '排序失败')
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-toolbar">
      <div class="page-title">
        <h1 :aria-label="`${platform.label} · 申诉流程`">申诉流程</h1>
        <p>按模块组织申诉步骤，明确每一步需要的材料与操作。</p>
      </div>
      <el-button
        v-if="auth.canWrite.value"
        type="primary"
        size="large"
        aria-label="增加一个模块"
        @click="openCreateModule"
      >
        新增模块
      </el-button>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <EntityState
      :loading="loading"
      :error="loadError"
      :empty="!loading && !loadError && modules.length === 0"
      empty-title="还没有申诉模块"
      empty-description="创建模块后即可继续添加申诉步骤。"
    >
      <el-button v-if="auth.canWrite.value" type="primary" @click="openCreateModule">
        创建模块
      </el-button>
      <template #error-action><el-button @click="load">重新加载</el-button></template>
      <template #content>
        <div class="flow-layout">
          <section class="page-card module-column">
            <div class="column-heading">
              <div>
                <strong>申诉模块 · {{ modules.length }} 个</strong>
              </div>
            </div>
            <button
              v-for="module in modules"
              :key="module.id"
              type="button"
              class="module-card"
              :class="{ active: selectedModuleId === module.id }"
              @click="selectedModuleId = module.id"
            >
              <span>
                <strong>{{ module.name }}</strong>
                <small>{{ module.description || '暂无说明' }}</small>
              </span>
              <el-tag :type="module.enabled && !module.archived ? 'success' : 'info'" size="small">
                {{ module.archived ? '已归档' : module.enabled ? '启用' : '停用' }}
              </el-tag>
            </button>
          </section>

          <section class="page-card step-column">
            <div v-if="selectedModule" class="step-heading">
              <div>
                <h2>{{ selectedModule.name }}</h2>
                <p>{{ selectedModule.description || '暂无模块说明' }}</p>
              </div>
              <div v-if="auth.canWrite.value" class="heading-actions">
                <el-button @click="openEditModule(selectedModule)">编辑模块</el-button>
                <el-button type="danger" plain @click="removeModule(selectedModule)"
                  >删除</el-button
                >
                <el-button type="primary" aria-label="增加一个步骤" @click="openCreateStep"
                  >新增步骤</el-button
                >
              </div>
            </div>

            <el-empty v-if="selectedSteps.length === 0" description="这个模块还没有步骤">
              <el-button v-if="auth.canWrite.value" type="primary" @click="openCreateStep">
                添加第一步
              </el-button>
            </el-empty>
            <div v-else class="steps-list">
              <article v-for="(step, index) in selectedSteps" :key="step.id" class="step-card">
                <div class="step-number">{{ String(index + 1).padStart(2, '0') }}</div>
                <div class="step-content">
                  <div class="step-title-row">
                    <h3>{{ step.name }}</h3>
                    <el-tag v-if="step.archived" type="info" size="small">已归档</el-tag>
                  </div>
                  <p>{{ step.instructions }}</p>
                  <small v-if="step.note">备注：{{ step.note }}</small>
                </div>
                <div v-if="auth.canWrite.value" class="step-actions">
                  <el-button text :disabled="index === 0" @click="moveStep(step, -1)"
                    >上移</el-button
                  >
                  <el-button
                    text
                    :disabled="index === selectedSteps.length - 1"
                    @click="moveStep(step, 1)"
                    >下移</el-button
                  >
                  <el-button text type="primary" @click="openEditStep(step)">编辑</el-button>
                  <el-button text type="danger" @click="removeStep(step)">删除</el-button>
                </div>
              </article>
            </div>
          </section>
        </div>
      </template>
    </EntityState>

    <el-dialog
      v-if="auth.canWrite.value"
      v-model="moduleDialogOpen"
      :title="moduleForm.id ? '编辑申诉模块' : '新增申诉模块'"
      width="min(620px, 94vw)"
    >
      <el-form label-position="top">
        <el-form-item label="模块名称" required
          ><el-input v-model="moduleForm.name"
        /></el-form-item>
        <el-form-item label="说明">
          <el-input v-model="moduleForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="moduleForm.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="moduleForm.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="moduleDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveModule">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="auth.canWrite.value"
      v-model="stepDialogOpen"
      :title="stepForm.id ? '编辑申诉步骤' : '新增申诉步骤'"
      width="min(680px, 94vw)"
    >
      <el-form label-position="top">
        <el-form-item label="步骤名称" required><el-input v-model="stepForm.name" /></el-form-item>
        <el-form-item label="操作说明" required>
          <el-input v-model="stepForm.instructions" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="stepForm.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stepDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveStep">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.flow-layout {
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr);
  gap: 24px;
}

.module-column,
.step-column {
  min-width: 0;
  padding: 24px;
}

.column-heading,
.step-heading {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}

.column-heading strong,
.column-heading small {
  display: block;
}

.column-heading small {
  margin-top: 3px;
  color: var(--muted);
}

.module-card {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 104px;
  padding: 12px;
  margin-bottom: 16px;
  text-align: left;
  cursor: pointer;
  background: var(--am-bg);
  border: 0;
  border-radius: 8px;
}

.module-card:hover,
.module-card.active {
  background: var(--teal-soft);
}

.module-card.active strong {
  color: var(--am-primary);
}

.module-card span {
  min-width: 0;
}

.module-card strong,
.module-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.module-card small {
  margin-top: 4px;
  color: var(--muted);
}

.eyebrow {
  color: var(--teal);
  font-size: 0.73rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.step-heading h2 {
  margin: 0 0 8px;
  color: var(--navy);
  font-size: 24px;
  line-height: 34px;
}

.step-heading p {
  margin: 0;
  color: var(--muted);
}

.heading-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: flex-end;
}

.steps-list {
  display: grid;
  gap: 16px;
}

.step-card {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px 0;
  align-items: start;
  min-height: 160px;
  padding: 16px;
  background: var(--am-bg);
  border: 0;
  border-radius: 8px;
}

.step-number {
  width: auto;
  height: 24px;
  color: var(--am-primary);
  font-family: Inter, sans-serif;
  font-size: 13px;
  font-weight: 400;
  line-height: 24px;
}

.step-content {
  display: contents;
}

.step-title-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 24px;
}

.step-title-row h3 {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}

.step-content h3,
.step-content p {
  margin: 0;
}

.step-content p {
  grid-column: 1 / -1;
  margin-top: 0;
  color: var(--muted);
  line-height: 22px;
  white-space: pre-wrap;
}

.step-content small {
  grid-column: 1 / -1;
  margin-top: 0;
  color: var(--muted);
}

.step-actions {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1 / -1;
  align-self: end;
  justify-content: flex-end;
}

@media (max-width: 1050px) {
  .flow-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .step-heading,
  .column-heading {
    display: block;
  }

  .heading-actions {
    justify-content: flex-start;
    margin-top: 14px;
  }

  .step-card {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .step-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
</style>
