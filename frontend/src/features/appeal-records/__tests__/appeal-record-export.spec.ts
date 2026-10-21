import { describe, expect, it } from 'vitest'

import type { AppealRecord } from '../../../domain/entities'
import { buildCompletedIpExport } from '../appeal-record-export'

function record(overrides: Partial<AppealRecord>): AppealRecord {
  return {
    id: 'record-1',
    platformId: 'ins',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    archived: false,
    status: '部分完成',
    country: '美国',
    ip: '203.0.113.0/24\n198.51.100.0/24',
    completedIps: ['203.0.113.0/24'],
    appealedAt: '2026-09-01T00:00:00.000Z',
    appealPlatform: 'INS',
    note: '',
    template1: '',
    template2: '',
    ...overrides,
  }
}

describe('buildCompletedIpExport', () => {
  it('exports only checked IPs with their countries in record and IP order', () => {
    const result = buildCompletedIpExport([
      record({
        completedIps: ['198.51.100.0/24', '203.0.113.0/24'],
      }),
      record({
        id: 'record-2',
        country: '日本',
        ip: '192.0.2.10\n192.0.2.11',
        completedIps: ['192.0.2.11'],
      }),
    ])

    expect(result).toEqual({
      count: 3,
      text: '美国\t203.0.113.0/24\r\n美国\t198.51.100.0/24\r\n日本\t192.0.2.11',
    })
  })

  it('ignores stale completed IP values that are no longer in the record', () => {
    const result = buildCompletedIpExport([record({ completedIps: ['203.0.113.0/24', '8.8.8.8'] })])

    expect(result).toEqual({ count: 1, text: '美国\t203.0.113.0/24' })
  })

  it('returns an empty export when no IP is checked', () => {
    expect(buildCompletedIpExport([record({ completedIps: [] })])).toEqual({
      count: 0,
      text: '',
    })
  })
})
