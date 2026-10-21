import { describe, expect, it } from 'vitest'

import { buildTikTokAppealTemplate } from '../tiktok-template'

describe('TikTok appeal templates', () => {
  it.each([
    [1, '$tiktok-ip-geolocation-appeal'],
    [2, '$tiktok-ip-geolocation-appeal2'],
  ] as const)('builds fixed template %i from the record and linked account', (template, skill) => {
    const result = buildTikTokAppealTemplate({
      template,
      country: '韩国',
      ip: '195.86.243.0/24\n195.86.217.0/24\n72.57.184.0/24',
      account: {
        account: 'oqym11',
        emailAccount: 'uhjjmzgcb8341@outlook.com',
      },
    })

    expect(result).toBe(`${skill}
正确国家：韩国
TikTok 用户名：oqym11
联系邮箱：uhjjmzgcb8341@outlook.com

Ip
195.86.243.0/24
195.86.217.0/24
72.57.184.0/24`)
  })

  it('normalizes escaped account fields without changing IP order', () => {
    const result = buildTikTokAppealTemplate({
      template: 1,
      country: ' 韩国 ',
      ip: '195.86.243.0/24\n72.57.183.0/24',
      account: {
        account: ' oqym\\_11 ',
        emailAccount: ' mailto:uhjjmzgcb8341\\@outlook.com ',
      },
    })

    expect(result).toContain(`正确国家：韩国
TikTok 用户名：oqym_11
联系邮箱：uhjjmzgcb8341@outlook.com`)
    expect(result).toMatch(/Ip\n195\.86\.243\.0\/24\n72\.57\.183\.0\/24$/)
  })

  it.each([1, 2] as const)('requires a linked account for template %i', (template) => {
    expect(() =>
      buildTikTokAppealTemplate({
        template,
        country: '韩国',
        ip: '195.86.243.0/24',
      }),
    ).toThrow(`模板 ${template} 需要先关联账号`)
  })

  it('requires the TikTok username and contact email', () => {
    expect(() =>
      buildTikTokAppealTemplate({
        template: 1,
        country: '韩国',
        ip: '195.86.243.0/24',
        account: { account: ' ', emailAccount: 'appeal@example.com' },
      }),
    ).toThrow('模板 1 关联账号缺少 TikTok 用户名')

    expect(() =>
      buildTikTokAppealTemplate({
        template: 2,
        country: '韩国',
        ip: '195.86.243.0/24',
        account: { account: 'oqym11', emailAccount: 'mailto: ' },
      }),
    ).toThrow('模板 2 关联账号缺少联系邮箱')
  })

  it('requires the country and IP list', () => {
    const account = { account: 'oqym11', emailAccount: 'appeal@example.com' }

    expect(() =>
      buildTikTokAppealTemplate({ template: 1, country: ' ', ip: '195.86.243.0/24', account }),
    ).toThrow('模板 1 缺少正确国家')
    expect(() =>
      buildTikTokAppealTemplate({ template: 2, country: '韩国', ip: ' ', account }),
    ).toThrow('模板 2 缺少 IP')
  })
})
