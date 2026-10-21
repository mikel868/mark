<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref, watch } from 'vue'

import type { VerificationIpCredential } from '../../domain/entities'
import {
  firstValidationMessage,
  verificationIpCredentialContent,
  verificationIpCredentialSchema,
} from '../../domain/validation'
import { copyText } from '../../utils/clipboard'
import { parseVerificationIpQuickImport } from './verification-ip-quick-import'

interface VerificationIpDraft {
  network: string
  content: string
}

const props = defineProps<{
  modelValue: boolean
  networks: string[]
  credentials: VerificationIpCredential[]
  readonly?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [credentials: VerificationIpCredential[]]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
const draft = ref<VerificationIpDraft[]>([])
const copyContents = computed(() => draft.value.map((row) => row.content.trim()).filter(Boolean))
const quickImportOpen = ref(false)
const quickImportText = ref('')
const quickImportFeedback = ref('')
const quickImportFeedbackType = ref<'success' | 'warning'>('success')

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) return
    quickImportOpen.value = false
    quickImportText.value = ''
    quickImportFeedback.value = ''
    const credentialByNetwork = new Map(
      props.credentials.map((credential) => [credential.network, credential]),
    )
    draft.value = props.networks.map((network) => {
      const credential = credentialByNetwork.get(network)
      return {
        network,
        content: credential ? verificationIpCredentialContent(credential) : '',
      }
    })
  },
  { immediate: true },
)

function save() {
  if (props.readonly) return

  const credentials: VerificationIpCredential[] = []

  for (const row of draft.value) {
    const result = verificationIpCredentialSchema.safeParse({
      network: row.network,
      content: row.content,
      ip: '',
      account: '',
      password: '',
    })
    if (!result.success) {
      ElMessage.warning(firstValidationMessage(result.error))
      return
    }
    if (verificationIpCredentialContent(result.data)) {
      credentials.push(result.data)
    }
  }

  emit('save', credentials)
}

function applyQuickImport() {
  const result = parseVerificationIpQuickImport(props.networks, quickImportText.value)
  const contentByNetwork = new Map(
    result.assignments.map((assignment) => [assignment.network, assignment.content]),
  )

  for (const row of draft.value) {
    const content = contentByNetwork.get(row.network)
    if (content) row.content = content
  }

  const issues: string[] = []
  if (result.invalidLines.length) {
    issues.push(
      `格式错误 ${result.invalidLines.length} 条（第 ${lineNumbers(result.invalidLines)} 行）`,
    )
  }
  if (result.unmatchedLines.length) {
    issues.push(
      `未匹配网段 ${result.unmatchedLines.length} 条（第 ${lineNumbers(result.unmatchedLines)} 行）`,
    )
  }
  if (result.duplicateNetworks.length) {
    issues.push(`重复网段 ${result.duplicateNetworks.length} 个，已使用最后一条`)
  }

  quickImportFeedbackType.value = issues.length ? 'warning' : 'success'
  quickImportFeedback.value = `已匹配并填入 ${result.assignments.length} 条${
    issues.length ? `；${issues.join('；')}` : ''
  }`
}

function lineNumbers(lines: Array<{ lineNumber: number }>) {
  return lines.map((line) => line.lineNumber).join('、')
}

async function copyAll() {
  if (!copyContents.value.length) {
    ElMessage.info('暂无可复制的验证 IP')
    return
  }

  try {
    await copyText(copyContents.value.join('\n'))
    ElMessage.success(`已复制 ${copyContents.value.length} 条验证 IP`)
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="验证 IP 与账密"
    width="min(980px, 96vw)"
    top="5vh"
    append-to-body
  >
    <div class="dialog-intro">
      <p class="dialog-tip">
        左侧是这条申诉记录已有的 IP 或网段；右侧把验证 IP、账号和密码写在同一个输入框中，
        内容可以先只填一部分，稍后继续补充。
      </p>
      <el-button v-if="!readonly" type="primary" plain @click="quickImportOpen = !quickImportOpen">
        快速导入
      </el-button>
    </div>

    <section v-if="quickImportOpen && !readonly" class="quick-import-panel">
      <strong>批量粘贴 IP 账密</strong>
      <p>每行格式：IP:端口:账号:密码。系统会比较 IP，并填入它所属的 IP 或网段。</p>
      <el-input
        v-model="quickImportText"
        type="textarea"
        :rows="5"
        resize="vertical"
        aria-label="快速导入验证 IP 与账密"
        :placeholder="'例如：\n199.239.49.37:6728:账号:密码\\\n64.32.179.189:7311:账号:密码'"
      />
      <div class="quick-import-actions">
        <span>行尾带有 \ 会自动忽略。</span>
        <el-button type="primary" :disabled="!quickImportText.trim()" @click="applyQuickImport">
          对比 IP 并填入
        </el-button>
      </div>
      <el-alert
        v-if="quickImportFeedback"
        :type="quickImportFeedbackType"
        :closable="false"
        show-icon
        :title="quickImportFeedback"
      />
    </section>

    <div class="verification-table" :class="{ 'has-quick-import': quickImportOpen }">
      <div class="verification-header" aria-hidden="true">
        <strong>已有 IP / 网段</strong>
        <strong>验证 IP 与账密</strong>
      </div>
      <div v-for="row in draft" :key="row.network" class="verification-row">
        <div class="network-cell">
          <small>已有 IP / 网段</small>
          <code>{{ row.network }}</code>
        </div>
        <div class="credential-fields">
          <el-input
            v-model="row.content"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 3 }"
            :aria-label="`${row.network} 验证 IP 与账密`"
            placeholder="例如：203.0.113.25 账号 密码，可只填写一部分"
            :readonly="readonly"
            :clearable="!readonly"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button type="success" plain :disabled="copyContents.length === 0" @click="copyAll">
          一键复制
        </el-button>
        <div class="footer-actions">
          <el-button :disabled="saving" @click="visible = false">
            {{ readonly ? '关闭' : '取消' }}
          </el-button>
          <el-button v-if="!readonly" type="primary" :loading="saving" @click="save">
            保存验证 IP
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 16px;
}

.dialog-tip {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}

.quick-import-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid #b8d7ff;
  border-radius: 10px;
  background: #f4f8ff;
}

.quick-import-panel p {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.5;
}

.quick-import-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quick-import-actions span {
  color: var(--muted);
  font-size: 0.8rem;
}

.verification-table {
  max-height: min(62vh, 640px);
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.verification-table.has-quick-import {
  max-height: min(39vh, 420px);
}

.verification-header,
.verification-row {
  display: grid;
  grid-template-columns: minmax(170px, 0.8fr) minmax(430px, 2fr);
  gap: 16px;
  align-items: center;
}

.verification-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 14px;
  color: var(--muted);
  background: #f6f8fb;
  font-size: 0.82rem;
}

.verification-row {
  padding: 14px;
  border-top: 1px solid var(--line);
}

.network-cell {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.network-cell small {
  display: none;
  color: var(--muted);
}

.network-cell code {
  overflow-wrap: anywhere;
  color: #253858;
  font-size: 0.9rem;
}

.credential-fields {
  min-width: 0;
}

.dialog-footer,
.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog-footer {
  justify-content: space-between;
}

@media (max-width: 760px) {
  .dialog-intro,
  .quick-import-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .verification-header {
    display: none;
  }

  .verification-row {
    grid-template-columns: 1fr;
  }

  .verification-row:first-child {
    border-top: 0;
  }

  .network-cell small {
    display: block;
  }
}
</style>
