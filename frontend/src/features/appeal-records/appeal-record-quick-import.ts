import { isValidIpOrCidr } from '../../domain/validation'

export const DEFAULT_APPEAL_RECORD_IMPORT_GROUP_SIZE = 5

export interface AppealRecordImportError {
  lineNumber: number
  value: string
  message: string
}

export interface AppealRecordQuickImportResult {
  normalizedIps: string[]
  groups: string[][]
  errors: AppealRecordImportError[]
  duplicateCount: number
}

export function parseAppealRecordQuickImport(
  text: string,
  groupSize: number = DEFAULT_APPEAL_RECORD_IMPORT_GROUP_SIZE,
): AppealRecordQuickImportResult {
  if (!Number.isInteger(groupSize) || groupSize < 1) {
    throw new RangeError('每条记录的网段数量必须是大于等于 1 的整数')
  }

  const lines = text
    .split(/\r?\n/)
    .map((value, index) => ({ lineNumber: index + 1, value: value.trim() }))
    .filter((line) => line.value.length > 0)

  const normalizedIps: string[] = []
  const errors: AppealRecordImportError[] = []
  const seen = new Set<string>()
  let duplicateCount = 0

  for (const line of lines) {
    const normalized = normalizeNetwork(line.value)
    if (!normalized) {
      errors.push({
        lineNumber: line.lineNumber,
        value: line.value,
        message: '不是有效的 IP 地址或网段',
      })
      continue
    }
    if (seen.has(normalized)) {
      duplicateCount += 1
      continue
    }

    seen.add(normalized)
    normalizedIps.push(normalized)
  }

  return {
    normalizedIps,
    groups: errors.length === 0 ? chunk(normalizedIps, groupSize) : [],
    errors,
    duplicateCount,
  }
}

function normalizeNetwork(value: string): string | null {
  if (isValidIpOrCidr(value)) return value

  const octets = value.split('.')
  if (octets.length !== 3 || !octets.every(isValidIpv4Octet)) return null
  return `${octets.map(Number).join('.')}.0/24`
}

function isValidIpv4Octet(value: string): boolean {
  if (!/^\d{1,3}$/.test(value)) return false
  const number = Number(value)
  return number >= 0 && number <= 255
}

function chunk<T>(values: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size))
  }
  return groups
}
