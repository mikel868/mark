import { describe, expect, it } from 'vitest'

import { accountInputSchema } from '../validation'

const baseAccount = {
  country: '美国',
  account: 'demo-account',
  password: 'account-password',
  emailAccount: 'demo@example.com',
  emailPassword: '',
  token: '',
  decodeLink: '',
  twoFactor: '',
  note: '',
}

describe('platform account validation', () => {
  it('accepts Google accounts without an email password', () => {
    const result = accountInputSchema.safeParse({
      ...baseAccount,
      platformId: 'google',
      twoFactor: 'GOOGLE2FA',
    })

    expect(result.success).toBe(true)
  })

  it('requires Google 2FA', () => {
    const result = accountInputSchema.safeParse({ ...baseAccount, platformId: 'google' })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toContain('2FA不能为空')
  })

  it('accepts TikTok accounts without 2FA', () => {
    const result = accountInputSchema.safeParse({
      ...baseAccount,
      platformId: 'tiktok',
      emailPassword: 'email-password',
      token: 'KR',
      decodeLink: 'https://decoder.example.test/demo-account',
    })

    expect(result.success).toBe(true)
  })

  it('requires the TikTok email password', () => {
    const result = accountInputSchema.safeParse({
      ...baseAccount,
      platformId: 'tiktok',
      token: 'KR',
      decodeLink: 'https://decoder.example.test/demo-account',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toContain('邮箱密码不能为空')
  })
})
