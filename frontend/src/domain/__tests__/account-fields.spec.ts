import { describe, expect, it } from 'vitest'

import { getAccountFields } from '../account-fields'

describe('platform account fields', () => {
  it('uses the Google field order and region label', () => {
    expect(getAccountFields('google').map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'country', label: '地区' },
      { key: 'account', label: '账号' },
      { key: 'password', label: '密码' },
      { key: 'twoFactor', label: '2FA' },
      { key: 'emailAccount', label: '邮箱账号' },
    ])
  })

  it('uses the TikTok field order with token and decode link', () => {
    expect(getAccountFields('tiktok').map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'country', label: '地区' },
      { key: 'account', label: '账号' },
      { key: 'password', label: '密码' },
      { key: 'emailAccount', label: '邮箱账号' },
      { key: 'emailPassword', label: '邮箱密码' },
      { key: 'token', label: '令牌' },
      { key: 'decodeLink', label: '解码连接' },
    ])
  })
})
