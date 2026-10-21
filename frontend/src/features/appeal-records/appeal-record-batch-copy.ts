import type { AppealRecord } from '../../domain/entities'
import {
  normalizeVerificationIpCredentials,
  verificationIpCredentialContent,
} from '../../domain/validation'

export interface AppealRecordBatchCopyResult {
  count: number
  text: string
}

export function buildAppealRecordIpBatchCopy(records: AppealRecord[]): AppealRecordBatchCopyResult {
  const lines = records.flatMap(recordIps)
  return copyResult(lines)
}

export function buildAppealRecordCredentialBatchCopy(
  records: AppealRecord[],
): AppealRecordBatchCopyResult {
  const lines = records.flatMap((record) =>
    normalizeVerificationIpCredentials(recordIps(record), record.verificationIps ?? []).map(
      verificationIpCredentialContent,
    ),
  )

  return copyResult(lines)
}

function recordIps(record: AppealRecord): string[] {
  return record.ip
    .split(/\r?\n/)
    .map((ip) => ip.trim())
    .filter(Boolean)
}

function copyResult(lines: string[]): AppealRecordBatchCopyResult {
  return { count: lines.length, text: lines.join('\n') }
}
