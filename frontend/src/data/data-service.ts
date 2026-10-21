import type {
  Account,
  AppealModule,
  AppealRecord,
  AppealStatus,
  AppealStep,
  BaseEntity,
  EntityInput,
  RecordEvidenceImage,
  VerificationIpCredential,
} from '../domain/entities'
import type { PlatformId } from '../domain/platform'
import { platformIds } from '../domain/platform'
import { verificationIpCredentialContent } from '../domain/validation'
import { api } from './api-client'

export const MAX_RECORD_EVIDENCE_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_RECORD_EVIDENCE_IMAGES = 10
export interface RecordEvidenceImageUpload {
  fileName: string
  blob: Blob
}
export interface DatabaseExport {
  accounts: Account[]
  appealModules: AppealModule[]
  appealSteps: AppealStep[]
  appealRecords: AppealRecord[]
  evidenceImages?: RecordEvidenceImage[]
}
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
export interface Summary {
  accounts: number
  usedAccounts: number
  appealRecords: number
  modules: number
  steps: number
  images: number
  statuses: { status: AppealStatus; count: number }[]
}
export interface AccountOption {
  id: string
  account: string
  country: string
  appealCount: number
}
export type Query = Record<string, string | number | boolean | undefined>
const base = (p: PlatformId) => `/platforms/${p}`
const idPath = (p: PlatformId, entity: string, id: string) =>
  `${base(p)}/${entity}/${encodeURIComponent(id)}`
function queryString(query: Query) {
  return new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString()
}
async function allPages<T>(path: string, query: Query = {}): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page++) {
    const result = await api<Page<T>>(`${path}?${queryString({ ...query, page, pageSize: 100 })}`)
    items.push(...result.items)
    if (items.length >= result.total || result.items.length === 0) return items
  }
}
const accountFields = [
  'country',
  'account',
  'password',
  'emailAccount',
  'emailPassword',
  'twoFactor',
  'token',
  'decodeLink',
  'note',
  'used',
]
const moduleFields = ['name', 'description', 'enabled', 'sortOrder', 'note']
const stepFields = ['moduleId', 'name', 'instructions', 'sortOrder', 'note']
const recordFields = [
  'status',
  'country',
  'ip',
  'appealedAt',
  'appealPlatform',
  'accountId',
  'moduleId',
  'stepId',
  'note',
  'template1',
  'template2',
]
// Compare with the editor's opening snapshot, never a new server read or a mutable cache.
function changedFields(input: object, fields: string[], original?: object) {
  const values = input as Record<string, unknown>
  const before = original as Record<string, unknown> | undefined
  return Object.fromEntries(
    fields
      .filter(
        (key) =>
          Object.hasOwn(values, key) && (!before || (values[key] ?? '') !== (before[key] ?? '')),
      )
      .map((key) => [key, values[key] ?? null]),
  )
}
function save<T extends BaseEntity>(
  entity: string,
  fields: string[],
  input: EntityInput<T>,
  original?: object,
): Promise<T> {
  if (input.id && !original) throw new Error('缺少编辑前的快照，请关闭编辑窗口后重试')
  const path = input.id
    ? idPath(input.platformId, entity, input.id)
    : `${base(input.platformId)}/${entity}`
  return api<T>(path, {
    method: input.id ? 'PATCH' : 'POST',
    body: changedFields(input, fields, original),
  })
}
export const dataService = {
  accountsPage: (p: PlatformId, q: Query) =>
    api<Page<Account>>(`${base(p)}/accounts?${queryString(q)}`),
  accountOptions: (p: PlatformId, q: Query) =>
    api<Page<AccountOption>>(`${base(p)}/accounts/options?${queryString(q)}`),
  getAccount: (p: PlatformId, id: string) => api<Account>(idPath(p, 'accounts', id)),
  saveAccount: (input: EntityInput<Account>, original?: object) =>
    save<Account>('accounts', accountFields, input, original),
  importAccounts(inputs: EntityInput<Account>[]) {
    const p = inputs[0]?.platformId
    if (!p || inputs.some((i) => i.platformId !== p))
      throw new Error('导入数据必须属于同一平台且不能为空')
    return api<{
      count: number
      ids: string[]
      warnings: { lineNumber: number; missingFields: string[] }[]
    }>(`${base(p)}/accounts/import`, {
      method: 'POST',
      body: { rows: inputs.map((i) => changedFields(i, accountFields)) },
    })
  },
  setAccountUsed: (p: PlatformId, id: string, used: boolean) =>
    api<Account>(`${idPath(p, 'accounts', id)}/used`, { method: 'PATCH', body: { used } }),
  deleteAccount: (p: PlatformId, id: string) =>
    api(idPath(p, 'accounts', id), { method: 'DELETE' }),
  listModules: (p: PlatformId) => allPages<AppealModule>(`${base(p)}/modules`),
  listSteps: (p: PlatformId, moduleId?: string) =>
    allPages<AppealStep>(`${base(p)}/steps`, { moduleId }),
  saveModule: (i: EntityInput<AppealModule>, original?: object) =>
    save<AppealModule>('modules', moduleFields, i, original),
  saveStep: (i: EntityInput<AppealStep>, original?: object) =>
    save<AppealStep>('steps', stepFields, i, original),
  deleteModule: (p: PlatformId, id: string) => api(idPath(p, 'modules', id), { method: 'DELETE' }),
  deleteStep: (p: PlatformId, id: string) => api(idPath(p, 'steps', id), { method: 'DELETE' }),
  swapStepOrder: (p: PlatformId, a: string, b: string) =>
    api(`${base(p)}/steps/swap-order`, { method: 'POST', body: { ids: [a, b] } }),
  archive: (p: PlatformId, entity: 'module' | 'step', id: string) =>
    api(`${idPath(p, `${entity}s`, id)}/archive`, { method: 'PATCH', body: { archived: true } }),
  async isReferenced(p: PlatformId, entity: 'module' | 'step', id: string) {
    return (
      (await dataService.recordsPage(p, { page: 1, pageSize: 1, [`${entity}Id`]: id })).total > 0
    )
  },
  recordsPage: (p: PlatformId, q: Query) =>
    api<Page<AppealRecord>>(`${base(p)}/appeal-records?${queryString(q)}`),
  listRecords: (p: PlatformId) => allPages<AppealRecord>(`${base(p)}/appeal-records`),
  saveRecord: (i: EntityInput<AppealRecord>, original?: object) =>
    save<AppealRecord>('appeal-records', recordFields, i, original),
  quickImportRecords: (p: PlatformId, country: string, text: string, groupSize: number) =>
    api<{ count: number }>(`${base(p)}/appeal-records/quick-import`, {
      method: 'POST',
      body: { country, text, groupSize },
    }),
  updateRecordStatuses: (p: PlatformId, ids: string[], status: AppealStatus) =>
    api<{ count: number }>(`${base(p)}/appeal-records/batch-status`, {
      method: 'PATCH',
      body: { ids, status },
    }),
  setIpCompleted(p: PlatformId, record: AppealRecord, network: string, completed: boolean) {
    const item = record.ipItems?.find((i) => i.network === network)
    if (!item) throw new Error('IP 已变更，请刷新记录后重试')
    return api<AppealRecord>(
      `${idPath(p, 'appeal-records', record.id)}/ips/${encodeURIComponent(item.id)}/completed`,
      { method: 'PATCH', body: { completed } },
    )
  },
  saveVerificationIps(
    p: PlatformId,
    record: AppealRecord,
    before: VerificationIpCredential[],
    after: VerificationIpCredential[],
  ) {
    const edits = (record.ipItems ?? []).flatMap((ip) => {
      const old = before.find((v) => v.network === ip.network)
      const next = after.find((v) => v.network === ip.network)
      const content = next ? verificationIpCredentialContent(next) : ''
      return content === (old ? verificationIpCredentialContent(old) : '')
        ? []
        : [{ ipId: ip.id, content }]
    })
    return api<AppealRecord>(`${idPath(p, 'appeal-records', record.id)}/verification-ips`, {
      method: 'PATCH',
      body: { edits },
    })
  },
  importVerificationIps: (p: PlatformId, text: string) =>
    api<{
      updatedCount: number
      matchedNetworkCount: number
      invalidLines: unknown[]
      unmatchedLines: unknown[]
    }>(`${base(p)}/appeal-records/verification-ips/quick-import`, {
      method: 'POST',
      body: { scope: 'platform', text },
    }),
  deleteRecord: (p: PlatformId, id: string) =>
    api(idPath(p, 'appeal-records', id), { method: 'DELETE' }),
  async deleteRecords(p: PlatformId, ids: string[]) {
    return (
      await api<{ count: number }>(`${base(p)}/appeal-records/batch-delete`, {
        method: 'POST',
        body: { ids },
      })
    ).count
  },
  exportCompletedIps: (p: PlatformId) =>
    api<Blob>(`${base(p)}/appeal-records/completed-ips/export`, { response: 'blob' }),
  async listRecordEvidenceImages(p: PlatformId, recordId: string) {
    const path = `${idPath(p, 'appeal-records', recordId)}/images`
    const images = await api<Omit<RecordEvidenceImage, 'blob'>[]>(path)
    return Promise.all(
      images.map(async (image) => ({
        ...image,
        blob: await api<Blob>(`${path}/${encodeURIComponent(image.id)}`, { response: 'blob' }),
      })),
    )
  },
  addRecordEvidenceImages(p: PlatformId, recordId: string, uploads: RecordEvidenceImageUpload[]) {
    const body = new FormData()
    for (const upload of uploads) body.append('files', upload.blob, upload.fileName)
    return api(`${idPath(p, 'appeal-records', recordId)}/images`, { method: 'POST', body })
  },
  deleteRecordEvidenceImage: (p: PlatformId, r: string, id: string) =>
    api(`${idPath(p, 'appeal-records', r)}/images/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  summary: (p: PlatformId) => api<Summary>(`${base(p)}/summary`),
  filterOptions: (p: PlatformId) =>
    api<{ accountCountries: string[]; recordCountries: string[] }>(`${base(p)}/filter-options`),
  async countAll() {
    const results = await Promise.all(platformIds.map((p) => dataService.summary(p)))
    return results.reduce(
      (sum, x) => ({
        accounts: sum.accounts + x.accounts,
        modules: sum.modules + x.modules,
        steps: sum.steps + x.steps,
        records: sum.records + x.appealRecords,
        images: sum.images + x.images,
      }),
      { accounts: 0, modules: 0, steps: 0, records: 0, images: 0 },
    )
  },
  exportBackup: () => api<Blob>('/backups/export', { response: 'blob' }),
  restoreBackup(file: File, operationId: string) {
    const body = new FormData()
    body.append('file', file)
    body.append('operationId', operationId)
    body.append('confirmation', 'REPLACE_ALL_PLATFORMS')
    return api('/backups/restore', { method: 'POST', body })
  },
  restoreReceipt: (id: string) => api(`/backups/restores/${encodeURIComponent(id)}`),
}
