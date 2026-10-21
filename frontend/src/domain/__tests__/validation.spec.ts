import { describe, expect, it } from 'vitest'

import {
  accountInputSchema,
  appealRecordInputSchema,
  isIpAddressWithinNetwork,
  isValidIpOrCidr,
} from '../validation'

describe('domain validation', () => {
  it('accepts a complete account row', () => {
    const result = accountInputSchema.safeParse({
      platformId: 'tiktok',
      country: '美国',
      account: 'demo-account',
      password: 'secret',
      emailAccount: 'demo@example.com',
      emailPassword: 'mail-secret',
      token: 'KR',
      decodeLink: 'https://decoder.example.test/demo-account',
      twoFactor: 'AAAA BBBB CCCC',
      note: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects missing account fields', () => {
    const result = accountInputSchema.safeParse({
      platformId: 'ins',
      country: '',
      account: '',
      password: '',
      emailAccount: '',
      emailPassword: '',
      twoFactor: '',
      note: '',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.length).toBeGreaterThanOrEqual(6)
  })

  it.each(['1.1.1.1', '192.168.0.10', '2001:db8::1', '::1', '194.179.156.0/24', '2001:db8::/32'])(
    'accepts valid IP address or CIDR %s',
    (value) => {
      expect(isValidIpOrCidr(value)).toBe(true)
    },
  )

  it.each(['999.1.1.1', 'hello', '10.0.0', '1:2:3', ':::', '1.1.1.1/33', '2001:db8::/129'])(
    'rejects invalid IP address or CIDR %s',
    (value) => {
      expect(isValidIpOrCidr(value)).toBe(false)
    },
  )

  it.each([
    ['209.166.41.12', '209.166.41.0/24', true],
    ['209.166.42.1', '209.166.41.0/24', false],
    ['2001:db8::12', '2001:db8::/32', true],
    ['2001:db9::12', '2001:db8::/32', false],
    ['1.1.1.1', '1.1.1.1', true],
    ['1.1.1.2', '1.1.1.1', false],
  ])('checks whether %s belongs to %s', (ip, network, expected) => {
    expect(isIpAddressWithinNetwork(ip, network)).toBe(expected)
  })

  it('rejects an appeal record with an unknown status', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'google',
      status: '未知状态',
      country: '德国',
      ip: '1.1.1.1',
      appealedAt: new Date().toISOString(),
      appealPlatform: 'Google',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(false)
  })

  it('accepts the partially complete appeal status', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'ins',
      status: '部分完成',
      country: '美国',
      ip: '1.1.1.1',
      appealedAt: new Date().toISOString(),
      appealPlatform: 'Instagram',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects an appeal record with an empty appeal time', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'google',
      status: '准备中',
      country: '德国',
      ip: '1.1.1.1',
      appealedAt: '',
      appealPlatform: 'Google',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(false)
  })

  it('accepts and normalizes one IP address per line', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'ins',
      status: '准备中',
      country: '美国',
      ip: '  1.1.1.1  \n\n 194.179.156.0/24 \n 2001:db8::/32 \n',
      appealedAt: new Date().toISOString(),
      appealPlatform: 'Instagram',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ip).toBe('1.1.1.1\n194.179.156.0/24\n2001:db8::/32')
      expect(result.data.completedIps).toEqual([])
    }
  })

  it('removes duplicate IP rows before binding verification credentials', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'ins',
      status: '准备中',
      country: '美国',
      ip: '203.0.113.0/24\n203.0.113.0/24\n198.51.100.0/24',
      appealedAt: new Date().toISOString(),
      appealPlatform: 'Instagram',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ip).toBe('203.0.113.0/24\n198.51.100.0/24')
    }
  })

  it('accepts partial verification IP credentials', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'ins',
      status: '准备中',
      country: '美国',
      ip: '203.0.113.0/24\n198.51.100.0/24',
      verificationIps: [
        {
          network: '203.0.113.0/24',
          ip: '203.0.113.25',
          account: 'proxy-user',
          password: '',
        },
        {
          network: '198.51.100.0/24',
          ip: '',
          account: '',
          password: 'proxy-password',
        },
      ],
      appealedAt: new Date().toISOString(),
      appealPlatform: 'Instagram',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(true)
  })

  it('accepts a combined verification IP and credentials value', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'ins',
      status: '准备中',
      country: '美国',
      ip: '203.0.113.0/24',
      verificationIps: [
        {
          network: '203.0.113.0/24',
          content: '203.0.113.25 proxy-user proxy-password',
          ip: '',
          account: '',
          password: '',
        },
      ],
      appealedAt: new Date().toISOString(),
      appealPlatform: 'Instagram',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a combined verification IP outside its network', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'ins',
      status: '准备中',
      country: '美国',
      ip: '203.0.113.0/24',
      verificationIps: [
        {
          network: '203.0.113.0/24',
          content: '203.0.114.1 proxy-user proxy-password',
          ip: '',
          account: '',
          password: '',
        },
      ],
      appealedAt: new Date().toISOString(),
      appealPlatform: 'Instagram',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('验证 IP 不属于网段 203.0.113.0/24')
  })

  it('rejects a verification IP outside its network', () => {
    const result = appealRecordInputSchema.safeParse({
      platformId: 'ins',
      status: '准备中',
      country: '美国',
      ip: '203.0.113.0/24',
      verificationIps: [
        {
          network: '203.0.113.0/24',
          ip: '203.0.114.1',
          account: '',
          password: '',
        },
      ],
      appealedAt: new Date().toISOString(),
      appealPlatform: 'Instagram',
      note: '',
      template1: '',
      template2: '',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('验证 IP 不属于网段 203.0.113.0/24')
  })

  it.each(['1.1.1.1\nnot-an-ip', '1.1.1.1, 8.8.8.8', '1.1.1.1 8.8.8.8'])(
    'rejects IP lists that do not contain exactly one valid address per line: %s',
    (ip) => {
      const result = appealRecordInputSchema.safeParse({
        platformId: 'ins',
        status: '准备中',
        country: '美国',
        ip,
        appealedAt: new Date().toISOString(),
        appealPlatform: 'Instagram',
        note: '',
        template1: '',
        template2: '',
      })

      expect(result.success).toBe(false)
    },
  )
})
