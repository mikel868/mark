import { describe, expect, it } from 'vitest'

import { parseVerificationIpQuickImport } from '../verification-ip-quick-import'

describe('verification IP quick import', () => {
  it('matches colon-delimited credentials to their record networks', () => {
    const result = parseVerificationIpQuickImport(
      [
        '199.239.49.0/24',
        '64.32.179.0/24',
        '204.237.146.0/24',
        '204.237.212.0/24',
        '204.237.153.0/24',
      ],
      [
        '199.239.49.37:6728:dvwi3ccYL8HQ:twuH5bJdT07Y\\',
        '64.32.179.189:7311:MSXo5uvkdhld:trFD2Q4xaZzV\\',
        '204.237.146.81:7443:RLea4PeBv9wJ:bXBYBlDCn9qN\\',
        '204.237.212.172:7627:S5EVzOlRubES:A61QmdhL67Rz\\',
        '204.237.153.241:7571:x6j9tOZIPSwA:qNXeu5q7FRwv',
      ].join('\n'),
    )

    expect(result.assignments).toEqual([
      {
        network: '199.239.49.0/24',
        content: '199.239.49.37:6728:dvwi3ccYL8HQ:twuH5bJdT07Y',
      },
      {
        network: '64.32.179.0/24',
        content: '64.32.179.189:7311:MSXo5uvkdhld:trFD2Q4xaZzV',
      },
      {
        network: '204.237.146.0/24',
        content: '204.237.146.81:7443:RLea4PeBv9wJ:bXBYBlDCn9qN',
      },
      {
        network: '204.237.212.0/24',
        content: '204.237.212.172:7627:S5EVzOlRubES:A61QmdhL67Rz',
      },
      {
        network: '204.237.153.0/24',
        content: '204.237.153.241:7571:x6j9tOZIPSwA:qNXeu5q7FRwv',
      },
    ])
    expect(result.invalidLines).toEqual([])
    expect(result.unmatchedLines).toEqual([])
    expect(result.duplicateNetworks).toEqual([])
  })

  it('reports malformed and unmatched lines without assigning them', () => {
    const result = parseVerificationIpQuickImport(
      ['199.239.49.0/24'],
      ['not-a-proxy', '999.239.49.37:6728:user:pass', '64.32.179.189:7311:user:pass'].join('\n'),
    )

    expect(result.assignments).toEqual([])
    expect(result.invalidLines).toEqual([
      { lineNumber: 1, value: 'not-a-proxy' },
      { lineNumber: 2, value: '999.239.49.37:6728:user:pass' },
    ])
    expect(result.unmatchedLines).toEqual([
      { lineNumber: 3, value: '64.32.179.189:7311:user:pass' },
    ])
  })

  it('uses the last credential when multiple lines match one network', () => {
    const result = parseVerificationIpQuickImport(
      ['199.239.49.0/24'],
      '199.239.49.37:6728:first:first-pass\n199.239.49.38:6729:second:second-pass',
    )

    expect(result.assignments).toEqual([
      {
        network: '199.239.49.0/24',
        content: '199.239.49.38:6729:second:second-pass',
      },
    ])
    expect(result.duplicateNetworks).toEqual(['199.239.49.0/24'])
  })
})
