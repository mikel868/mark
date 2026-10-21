import { describe, expect, it } from 'vitest'

import type { AppealRecord, VerificationIpCredential } from '../../../domain/entities'
import {
  buildAppealRecordCredentialBatchCopy,
  buildAppealRecordIpBatchCopy,
} from '../appeal-record-batch-copy'

describe('appeal record batch copy', () => {
  it('copies every IP from selected records in record and IP order', () => {
    const result = buildAppealRecordIpBatchCopy([
      record('first', '203.0.113.0/24\n198.51.100.0/24'),
      record('second', '192.0.2.10'),
    ])

    expect(result).toEqual({
      count: 3,
      text: '203.0.113.0/24\n198.51.100.0/24\n192.0.2.10',
    })
  })

  it('copies saved IP credentials in record and network order', () => {
    const result = buildAppealRecordCredentialBatchCopy([
      record('first', '203.0.113.0/24\n198.51.100.0/24', [
        credential('198.51.100.0/24', '198.51.100.42:7311:second:second-pass'),
        credential('203.0.113.0/24', '203.0.113.25:6728:first:first-pass'),
      ]),
      record('second', '192.0.2.0/24', [
        {
          network: '192.0.2.0/24',
          ip: '192.0.2.12:7443',
          account: 'legacy-user',
          password: 'legacy-pass',
        },
      ]),
    ])

    expect(result).toEqual({
      count: 3,
      text: [
        '203.0.113.25:6728:first:first-pass',
        '198.51.100.42:7311:second:second-pass',
        '192.0.2.12:7443 legacy-user legacy-pass',
      ].join('\n'),
    })
  })

  it('ignores empty and stale credentials outside the current record IP list', () => {
    const result = buildAppealRecordCredentialBatchCopy([
      record('record', '203.0.113.0/24', [
        credential('203.0.113.0/24', ' '),
        credential('198.51.100.0/24', '198.51.100.42:7311:stale:stale-pass'),
      ]),
    ])

    expect(result).toEqual({ count: 0, text: '' })
  })

  it('returns empty copy results when no records are selected', () => {
    expect(buildAppealRecordIpBatchCopy([])).toEqual({ count: 0, text: '' })
    expect(buildAppealRecordCredentialBatchCopy([])).toEqual({ count: 0, text: '' })
  })
})

function record(
  id: string,
  ip: string,
  verificationIps: VerificationIpCredential[] = [],
): AppealRecord {
  const now = '2026-09-04T00:00:00.000Z'
  return {
    id,
    platformId: 'ins',
    createdAt: now,
    updatedAt: now,
    archived: false,
    status: '准备中',
    country: '美国',
    ip,
    completedIps: [],
    verificationIps,
    appealedAt: now,
    appealPlatform: 'INS',
    note: '',
    template1: '',
    template2: '',
  }
}

function credential(network: string, content: string): VerificationIpCredential {
  return { network, content, ip: '', account: '', password: '' }
}
