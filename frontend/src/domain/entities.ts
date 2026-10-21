import type { PlatformId } from './platform'

export interface BaseEntity {
  id: string
  platformId: PlatformId
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface Account extends BaseEntity {
  used?: boolean
  country: string
  account: string
  password: string
  emailAccount: string
  emailPassword: string
  token?: string
  decodeLink?: string
  twoFactor: string
  note: string
}

export interface AppealModule extends BaseEntity {
  name: string
  description: string
  enabled: boolean
  sortOrder: number
  note: string
}

export interface AppealStep extends BaseEntity {
  moduleId: string
  name: string
  instructions: string
  sortOrder: number
  note: string
}

export const appealStatuses = [
  '准备中',
  '已提交',
  '审核中',
  '部分完成',
  '申诉成功',
  '申诉失败',
  '需要补充',
  '已关闭',
] as const

export type AppealStatus = (typeof appealStatuses)[number]

export interface VerificationIpCredential {
  network: string
  content?: string
  ip: string
  account: string
  password: string
}

export interface AppealRecord extends BaseEntity {
  ipItems?: { id: string; network: string; completed: boolean }[]
  status: AppealStatus
  country: string
  ip: string
  completedIps?: string[]
  verificationIps?: VerificationIpCredential[]
  appealedAt: string
  appealPlatform: string
  accountId?: string
  moduleId?: string
  stepId?: string
  note: string
  template1: string
  template2: string
}

export interface RecordEvidenceImage {
  id: string
  platformId: PlatformId
  recordId: string
  fileName: string
  mimeType: string
  size: number
  blob: Blob
  createdAt: string
}

export type EntityInput<T extends BaseEntity> = Omit<
  T,
  'id' | 'createdAt' | 'updatedAt' | 'archived'
> & {
  id?: string
  archived?: boolean
}

export function createEntity<T extends BaseEntity>(input: EntityInput<T>): T {
  const now = new Date().toISOString()
  return {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    archived: input.archived ?? false,
    createdAt: now,
    updatedAt: now,
  } as T
}
