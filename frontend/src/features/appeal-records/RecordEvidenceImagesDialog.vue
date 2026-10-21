<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import {
  dataService,
  MAX_RECORD_EVIDENCE_IMAGE_BYTES,
  MAX_RECORD_EVIDENCE_IMAGES,
} from '../../data/data-service'
import type { AppealRecord, RecordEvidenceImage } from '../../domain/entities'
import type { PlatformId } from '../../domain/platform'

interface EvidenceImagePreview extends RecordEvidenceImage {
  previewUrl: string
}

const props = defineProps<{
  modelValue: boolean
  platformId: PlatformId
  record: AppealRecord | null
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
const images = ref<EvidenceImagePreview[]>([])
const loading = ref(false)
const uploading = ref(false)
const deletingImageId = ref('')
const loadError = ref('')
let loadRequestId = 0
const canUpload = computed(
  () => !props.readonly && images.value.length < MAX_RECORD_EVIDENCE_IMAGES,
)
const title = computed(() => `验证证据图片 · ${props.record?.country || '申诉记录'}`)
const previewUrls = computed(() => images.value.map((image) => image.previewUrl))

watch(
  () => [props.modelValue, props.record?.id, props.platformId] as const,
  ([isOpen]) => {
    if (isOpen && props.record) void loadImages()
    else {
      loadRequestId += 1
      clearPreviews()
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearPreviews)

async function loadImages() {
  if (!props.record) return
  const requestId = ++loadRequestId
  loading.value = true
  loadError.value = ''
  try {
    const storedImages = await dataService.listRecordEvidenceImages(
      props.platformId,
      props.record.id,
    )
    const nextImages = storedImages.map((image) => ({
      ...image,
      previewUrl: URL.createObjectURL(image.blob),
    }))
    if (requestId !== loadRequestId || !props.modelValue) {
      revokePreviews(nextImages)
      return
    }
    clearPreviews()
    images.value = nextImages
  } catch (error) {
    if (requestId !== loadRequestId) return
    clearPreviews()
    loadError.value = error instanceof Error ? error.message : '无法读取证据图片'
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

async function uploadFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!props.record || props.readonly || files.length === 0) return

  uploading.value = true
  try {
    await dataService.addRecordEvidenceImages(
      props.platformId,
      props.record.id,
      files.map((file) => ({
        fileName: file.name,
        blob: file.slice(0, file.size, file.type),
      })),
    )
    ElMessage.success(`已保存 ${files.length} 张验证证据图片`)
    await loadImages()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '证据图片上传失败')
  } finally {
    uploading.value = false
  }
}

async function removeImage(image: EvidenceImagePreview) {
  if (!props.record || props.readonly || deletingImageId.value) return
  try {
    await ElMessageBox.confirm(`确定删除证据图片“${image.fileName}”吗？`, '删除证据图片', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    deletingImageId.value = image.id
    await dataService.deleteRecordEvidenceImage(props.platformId, props.record.id, image.id)
    ElMessage.success('证据图片已删除')
    await loadImages()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '证据图片删除失败')
    }
  } finally {
    deletingImageId.value = ''
  }
}

function clearPreviews() {
  revokePreviews(images.value)
  images.value = []
}

function revokePreviews(previews: EvidenceImagePreview[]) {
  for (const image of previews) URL.revokeObjectURL(image.previewUrl)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="min(920px, 96vw)"
    top="5vh"
    append-to-body
    destroy-on-close
  >
    <div class="evidence-toolbar">
      <div>
        <strong>{{ images.length }} / {{ MAX_RECORD_EVIDENCE_IMAGES }} 张</strong>
        <p>支持常见图片格式，单张不超过 {{ MAX_RECORD_EVIDENCE_IMAGE_BYTES / 1024 / 1024 }} MB。</p>
      </div>
      <label v-if="canUpload" class="image-picker" :class="{ 'is-uploading': uploading }">
        <input
          type="file"
          accept="image/*"
          multiple
          aria-label="上传验证证据图片"
          :disabled="uploading"
          @change="uploadFiles"
        />
        <span>{{ uploading ? '正在保存…' : '上传证据图片' }}</span>
      </label>
    </div>

    <el-alert
      v-if="readonly"
      title="当前为只读模式，可以查看但不能上传或删除证据图片。"
      type="info"
      :closable="false"
      show-icon
      class="evidence-alert"
    />
    <el-alert
      v-else-if="!canUpload"
      :title="`已达到每条记录 ${MAX_RECORD_EVIDENCE_IMAGES} 张图片的上限`"
      type="warning"
      :closable="false"
      show-icon
      class="evidence-alert"
    />
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      :closable="false"
      show-icon
      class="evidence-alert"
    />

    <div v-loading="loading" class="evidence-content">
      <el-empty
        v-if="!loading && !loadError && images.length === 0"
        description="还没有验证证据图片"
      />
      <div v-else class="evidence-grid">
        <article v-for="(image, index) in images" :key="image.id" class="evidence-card">
          <el-image
            :src="image.previewUrl"
            :preview-src-list="previewUrls"
            :initial-index="index"
            :alt="image.fileName"
            fit="cover"
            preview-teleported
            class="evidence-image"
          />
          <div class="evidence-meta">
            <strong :title="image.fileName">{{ image.fileName }}</strong>
            <small
              >{{ formatBytes(image.size) }} ·
              {{ new Date(image.createdAt).toLocaleString('zh-CN') }}</small
            >
          </div>
          <el-button
            v-if="!readonly"
            type="danger"
            link
            :loading="deletingImageId === image.id"
            :aria-label="`删除证据图片 ${image.fileName}`"
            @click="removeImage(image)"
          >
            删除
          </el-button>
        </article>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.evidence-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.evidence-toolbar p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 0.84rem;
}

.image-picker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 17px;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  background: var(--teal);
  border-radius: 8px;
}

.image-picker.is-uploading {
  cursor: wait;
  opacity: 0.65;
}

.image-picker input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.evidence-alert {
  margin-bottom: 14px;
}

.evidence-content {
  min-height: 210px;
  max-height: min(65vh, 660px);
  overflow: auto;
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
}

.evidence-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.evidence-image {
  grid-column: 1 / -1;
  width: 100%;
  height: 155px;
  overflow: hidden;
  cursor: zoom-in;
  background: #eef2f6;
  border-radius: 8px;
}

.evidence-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.evidence-meta strong {
  overflow: hidden;
  color: var(--navy);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evidence-meta small {
  color: var(--muted);
  line-height: 1.4;
}

@media (max-width: 620px) {
  .evidence-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .evidence-grid {
    grid-template-columns: 1fr;
  }
}
</style>
