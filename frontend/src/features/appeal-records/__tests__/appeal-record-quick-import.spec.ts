import { describe, expect, it } from 'vitest'

import { parseAppealRecordQuickImport } from '../appeal-record-quick-import'

describe('appeal record quick import', () => {
  it('normalizes three-octet IPv4 ranges and groups every five entries', () => {
    const result = parseAppealRecordQuickImport(`
      209.166.41
      205.179.217
      69.3.140
      72.245.153
      155.229.74
      216.254.7
    `)

    expect(result.errors).toEqual([])
    expect(result.groups).toEqual([
      [
        '209.166.41.0/24',
        '205.179.217.0/24',
        '69.3.140.0/24',
        '72.245.153.0/24',
        '155.229.74.0/24',
      ],
      ['216.254.7.0/24'],
    ])
  })

  it.each([
    { groupSize: 1, expectedGroupCount: 6 },
    { groupSize: 2, expectedGroupCount: 3 },
    { groupSize: 4, expectedGroupCount: 2 },
    { groupSize: 5, expectedGroupCount: 2 },
  ])('groups networks by the selected size of $groupSize', ({ groupSize, expectedGroupCount }) => {
    const result = parseAppealRecordQuickImport(
      ['209.166.41', '205.179.217', '69.3.140', '72.245.153', '155.229.74', '216.254.7'].join('\n'),
      groupSize,
    )

    expect(result.errors).toEqual([])
    expect(result.groups).toHaveLength(expectedGroupCount)
    expect(result.groups.every((group) => group.length <= groupSize)).toBe(true)
    expect(result.groups.flat()).toEqual(result.normalizedIps)
  })

  it('rejects a non-positive or non-integer group size', () => {
    expect(() => parseAppealRecordQuickImport('209.166.41', -1)).toThrow(
      '每条记录的网段数量必须是大于等于 1 的整数',
    )
    expect(() => parseAppealRecordQuickImport('209.166.41', 1.5)).toThrow(
      '每条记录的网段数量必须是大于等于 1 的整数',
    )
  })

  it('preserves valid addresses and CIDRs while removing duplicates', () => {
    const result = parseAppealRecordQuickImport(`
      194.179.156.0/24
      2001:db8::/32
      1.1.1.1
      194.179.156.0/24
    `)

    expect(result.groups).toEqual([['194.179.156.0/24', '2001:db8::/32', '1.1.1.1']])
    expect(result.duplicateCount).toBe(1)
  })

  it('removes leading zeroes when normalizing three-octet IPv4 ranges', () => {
    const result = parseAppealRecordQuickImport('010.001.002')

    expect(result.errors).toEqual([])
    expect(result.groups).toEqual([['10.1.2.0/24']])
  })

  it('reports invalid lines without generating import groups', () => {
    const result = parseAppealRecordQuickImport('209.166.41\nnot-a-network\n999.1.1')

    expect(result.groups).toEqual([])
    expect(result.errors).toEqual([
      { lineNumber: 2, value: 'not-a-network', message: '不是有效的 IP 地址或网段' },
      { lineNumber: 3, value: '999.1.1', message: '不是有效的 IP 地址或网段' },
    ])
  })

  it('returns an empty preview for blank input', () => {
    expect(parseAppealRecordQuickImport('  \n')).toEqual({
      normalizedIps: [],
      groups: [],
      errors: [],
      duplicateCount: 0,
    })
  })
})
