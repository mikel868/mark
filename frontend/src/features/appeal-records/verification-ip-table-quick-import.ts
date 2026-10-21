import type { AppealRecord, VerificationIpCredential } from '../../domain/entities'
import {
  parseVerificationIpQuickImport,
  type VerificationIpQuickImportResult,
} from './verification-ip-quick-import'

export interface VerificationIpTableUpdate {
  id: string
  verificationIps: VerificationIpCredential[]
}

export interface VerificationIpTableQuickImportResult extends VerificationIpQuickImportResult {
  updates: VerificationIpTableUpdate[]
}

export function buildVerificationIpTableQuickImport(
  records: AppealRecord[],
  text: string,
): VerificationIpTableQuickImportResult {
  const recordEntries = records.map((record) => ({ record, networks: recordNetworks(record) }))
  const networks = [...new Set(recordEntries.flatMap((entry) => entry.networks))]
  const parsed = parseVerificationIpQuickImport(networks, text)
  const contentByNetwork = new Map(
    parsed.assignments.map((assignment) => [assignment.network, assignment.content]),
  )

  const updates = recordEntries.flatMap(({ record, networks: recordIpNetworks }) => {
    const existingByNetwork = new Map(
      (record.verificationIps ?? []).map((credential) => [credential.network, credential]),
    )
    let matched = false
    const verificationIps = recordIpNetworks.flatMap((network) => {
      const content = contentByNetwork.get(network)
      if (content) {
        matched = true
        return [importedCredential(network, content)]
      }

      const existing = existingByNetwork.get(network)
      return existing ? [{ ...existing }] : []
    })

    return matched ? [{ id: record.id, verificationIps }] : []
  })

  return { ...parsed, updates }
}

function recordNetworks(record: AppealRecord): string[] {
  return record.ip.split('\n').filter(Boolean)
}

function importedCredential(network: string, content: string): VerificationIpCredential {
  return {
    network,
    content,
    ip: '',
    account: '',
    password: '',
  }
}
