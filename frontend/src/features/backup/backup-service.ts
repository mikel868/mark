import { z } from 'zod'

import type { DatabaseExport } from '../../data/data-service'
import { appealStatuses, type RecordEvidenceImage } from '../../domain/entities'
import { platformIds } from '../../domain/platform'
import {
  ipListSchema,
  normalizeVerificationIpCredentials,
  verificationIpCredentialSchema,
} from '../../domain/validation'

export const MAX_BACKUP_MEGABYTES = 100
export const MAX_BACKUP_BYTES = MAX_BACKUP_MEGABYTES * 1024 * 1024

export function createRestoreOperationId(): string {
  // Unlike randomUUID, getRandomValues is available on ordinary HTTP origins.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const validDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)))

const baseEntitySchema = z.object({
  id: z.string().min(1),
  platformId: z.enum(platformIds),
  createdAt: validDateTime,
  updatedAt: validDateTime,
  archived: z.boolean(),
})

const accountSchema = baseEntitySchema.extend({
  used: z.boolean().default(false),
  country: z.string(),
  account: z.string(),
  password: z.string(),
  emailAccount: z.string(),
  emailPassword: z.string(),
  token: z.string().default(''),
  decodeLink: z.string().default(''),
  twoFactor: z.string(),
  note: z.string(),
})

const moduleSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  note: z.string(),
})

const stepSchema = baseEntitySchema.extend({
  moduleId: z.string().min(1),
  name: z.string().min(1),
  instructions: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  note: z.string(),
})

const recordSchema = baseEntitySchema
  .extend({
    status: z.enum(appealStatuses),
    country: z.string().min(1),
    ip: ipListSchema,
    completedIps: z.array(z.string()).default([]),
    verificationIps: z.array(verificationIpCredentialSchema).default([]),
    appealedAt: validDateTime,
    appealPlatform: z.string().min(1),
    accountId: z.string().min(1).optional(),
    moduleId: z.string().min(1).optional(),
    stepId: z.string().min(1).optional(),
    note: z.string(),
    template1: z.string(),
    template2: z.string(),
  })
  .transform((record) => {
    const completedIpSet = new Set(record.completedIps)
    const networks = record.ip.split('\n')
    return {
      ...record,
      completedIps: networks.filter((ip) => completedIpSet.has(ip)),
      verificationIps: normalizeVerificationIpCredentials(networks, record.verificationIps),
    }
  })

const legacyBackupSchema = z.object({
  format: z.literal('platform-appeal-manager-backup'),
  version: z.literal(1),
  exportedAt: validDateTime,
  data: z.object({
    accounts: z.array(accountSchema),
    appealModules: z.array(moduleSchema),
    appealSteps: z.array(stepSchema),
    appealRecords: z.array(recordSchema),
  }),
})

const evidenceImageSchema = z.object({
  id: z.string().min(1),
  platformId: z.enum(platformIds),
  recordId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
  size: z.number().int().positive(),
  data: z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,/i),
  createdAt: validDateTime,
})

const currentBackupSchema = z.object({
  format: z.literal('platform-appeal-manager-backup'),
  version: z.literal(2),
  exportedAt: validDateTime,
  data: z.object({
    accounts: z.array(accountSchema),
    appealModules: z.array(moduleSchema),
    appealSteps: z.array(stepSchema),
    appealRecords: z.array(recordSchema),
    evidenceImages: z.array(evidenceImageSchema),
  }),
})

const backupSchema = z.union([legacyBackupSchema, currentBackupSchema])

export interface BackupDocument {
  format: 'platform-appeal-manager-backup'
  version: 1 | 2
  exportedAt: string
  data: DatabaseExport
}

export function parseBackup(text: string): BackupDocument {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) {
    throw new Error(`备份文件超过 ${MAX_BACKUP_MEGABYTES} MB 安全上限`)
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是有效的 JSON')
  }

  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) throw new Error('备份格式或版本不受支持')

  let data: DatabaseExport
  try {
    data = {
      accounts: parsed.data.data.accounts,
      appealModules: parsed.data.data.appealModules,
      appealSteps: parsed.data.data.appealSteps,
      appealRecords: parsed.data.data.appealRecords,
      evidenceImages:
        parsed.data.version === 2 ? parsed.data.data.evidenceImages.map(decodeEvidenceImage) : [],
    }
  } catch {
    throw new Error('备份格式或版本不受支持')
  }
  validateBackupRelations(data)
  return { ...parsed.data, data }
}

function validateBackupRelations(data: DatabaseExport) {
  assertUniqueIds(data.accounts, '账号')
  assertUniqueIds(data.appealModules, '模块')
  assertUniqueIds(data.appealSteps, '步骤')
  assertUniqueIds(data.appealRecords, '记录')
  assertUniqueIds(data.evidenceImages ?? [], '证据图片')

  const accounts = new Map(data.accounts.map((item) => [item.id, item]))
  const modules = new Map(data.appealModules.map((item) => [item.id, item]))
  const steps = new Map(data.appealSteps.map((item) => [item.id, item]))
  const records = new Map(data.appealRecords.map((item) => [item.id, item]))

  for (const step of data.appealSteps) {
    const module = modules.get(step.moduleId)
    if (!module || module.platformId !== step.platformId) {
      throw new Error(`备份中的步骤“${step.name}”关联了无效模块`)
    }
  }

  for (const record of data.appealRecords) {
    const account = record.accountId ? accounts.get(record.accountId) : undefined
    const module = record.moduleId ? modules.get(record.moduleId) : undefined
    const step = record.stepId ? steps.get(record.stepId) : undefined

    if (record.accountId && (!account || account.platformId !== record.platformId)) {
      throw new Error('备份中的申诉记录关联了无效账号')
    }
    if (record.moduleId && (!module || module.platformId !== record.platformId)) {
      throw new Error('备份中的申诉记录关联了无效模块')
    }
    if (
      record.stepId &&
      (!step || step.platformId !== record.platformId || step.moduleId !== record.moduleId)
    ) {
      throw new Error('备份中的申诉记录关联了无效步骤')
    }
  }

  for (const image of data.evidenceImages ?? []) {
    const record = records.get(image.recordId)
    if (!record || record.platformId !== image.platformId) {
      throw new Error(`备份中的证据图片“${image.fileName}”关联了无效申诉记录`)
    }
  }
}

function assertUniqueIds(items: Array<{ id: string }>, label: string) {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`备份中的${label} ID 重复`)
    ids.add(item.id)
  }
}

export function backupCounts(document: BackupDocument) {
  return {
    accounts: document.data.accounts.length,
    modules: document.data.appealModules.length,
    steps: document.data.appealSteps.length,
    records: document.data.appealRecords.length,
    images: document.data.evidenceImages?.length ?? 0,
  }
}

export async function serializeBackup(backup: BackupDocument): Promise<string> {
  const evidenceImages = await Promise.all(
    (backup.data.evidenceImages ?? []).map(async ({ blob, ...image }) => ({
      ...image,
      data: await blobToDataUrl(blob, image.mimeType),
    })),
  )
  return JSON.stringify(
    {
      ...backup,
      version: 2,
      data: { ...backup.data, evidenceImages },
    },
    null,
    2,
  )
}

function decodeEvidenceImage(image: z.infer<typeof evidenceImageSchema>): RecordEvidenceImage {
  if (!image.data.toLowerCase().startsWith(`data:${image.mimeType.toLowerCase()};base64,`)) {
    throw new Error('证据图片类型不一致')
  }
  const separatorIndex = image.data.indexOf(',')
  const bytes = Uint8Array.from(atob(image.data.slice(separatorIndex + 1)), (character) =>
    character.charCodeAt(0),
  )
  const blob = new Blob([bytes], { type: image.mimeType })
  if (blob.size !== image.size) throw new Error('证据图片大小不一致')
  return {
    id: image.id,
    platformId: image.platformId,
    recordId: image.recordId,
    fileName: image.fileName,
    mimeType: image.mimeType,
    size: image.size,
    blob,
    createdAt: image.createdAt,
  }
}

async function blobToDataUrl(blob: Blob, mimeType: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}
