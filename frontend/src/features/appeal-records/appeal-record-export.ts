import type { AppealRecord } from '../../domain/entities'
import type { PlatformId } from '../../domain/platform'

export interface CompletedIpExport {
  count: number
  text: string
}

function exportCountry(country: string) {
  return country.replace(/[\t\r\n]+/g, ' ').trim()
}

export function buildCompletedIpExport(records: AppealRecord[]): CompletedIpExport {
  const lines: string[] = []

  for (const record of records) {
    if (!record.completedIps?.length) continue

    const completedIps = new Set(record.completedIps)
    const country = exportCountry(record.country)
    for (const ip of record.ip.split('\n').filter(Boolean)) {
      if (completedIps.has(ip)) lines.push(`${country}\t${ip}`)
    }
  }

  return {
    count: lines.length,
    text: lines.join('\r\n'),
  }
}

export function downloadCompletedIpExport(
  exportData: CompletedIpExport,
  platformId: PlatformId,
  exportedAt = new Date(),
) {
  const blob = new Blob(['\uFEFF', exportData.text], {
    type: 'text/tab-separated-values;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${platformId}-completed-ips-${exportedAt.toISOString().slice(0, 10)}.tsv`
  anchor.click()
  URL.revokeObjectURL(url)
}
