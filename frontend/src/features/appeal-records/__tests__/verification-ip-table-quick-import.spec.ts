import { describe, expect, it } from 'vitest'

import type { AppealRecord, VerificationIpCredential } from '../../../domain/entities'
import { buildVerificationIpTableQuickImport } from '../verification-ip-table-quick-import'

describe('verification IP table quick import', () => {
  it('matches the whole table while preserving credentials for untouched networks', () => {
    const existingCredential: VerificationIpCredential = {
      network: '198.51.100.0/24',
      content: '198.51.100.20:7000:existing:existing-pass',
      ip: '',
      account: '',
      password: '',
    }
    const records = [
      record('first-record', '203.0.113.0/24\n198.51.100.0/24', [existingCredential]),
      record('second-record', '203.0.113.0/24\n192.0.2.0/24'),
    ]

    const result = buildVerificationIpTableQuickImport(
      records,
      [
        '203.0.113.25:6728:shared-user:shared-pass',
        '192.0.2.42:7311:second-user:second-pass',
        'not-a-credential',
        '10.0.0.10:7443:missing-user:missing-pass',
      ].join('\n'),
    )

    expect(result.assignments).toHaveLength(2)
    expect(result.invalidLines).toEqual([{ lineNumber: 3, value: 'not-a-credential' }])
    expect(result.unmatchedLines).toEqual([
      { lineNumber: 4, value: '10.0.0.10:7443:missing-user:missing-pass' },
    ])
    expect(result.updates).toEqual([
      {
        id: 'first-record',
        verificationIps: [
          {
            network: '203.0.113.0/24',
            content: '203.0.113.25:6728:shared-user:shared-pass',
            ip: '',
            account: '',
            password: '',
          },
          existingCredential,
        ],
      },
      {
        id: 'second-record',
        verificationIps: [
          {
            network: '203.0.113.0/24',
            content: '203.0.113.25:6728:shared-user:shared-pass',
            ip: '',
            account: '',
            password: '',
          },
          {
            network: '192.0.2.0/24',
            content: '192.0.2.42:7311:second-user:second-pass',
            ip: '',
            account: '',
            password: '',
          },
        ],
      },
    ])
  })

  it('returns no updates when none of the table networks match', () => {
    const result = buildVerificationIpTableQuickImport(
      [record('record', '203.0.113.0/24')],
      '198.51.100.10:6728:user:pass',
    )

    expect(result.assignments).toEqual([])
    expect(result.updates).toEqual([])
    expect(result.unmatchedLines).toHaveLength(1)
  })
})

function record(
  id: string,
  ip: string,
  verificationIps: VerificationIpCredential[] = [],
): AppealRecord {
  const now = new Date().toISOString()
  return {
    id,
    platformId: 'ins',
    status: '准备中',
    country: '美国',
    ip,
    completedIps: [],
    verificationIps,
    appealedAt: now,
    appealPlatform: 'Instagram',
    note: '',
    template1: '',
    template2: '',
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}
