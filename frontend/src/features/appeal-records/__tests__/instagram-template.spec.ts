import { describe, expect, it } from 'vitest'

import { buildInstagramAppealTemplate } from '../instagram-template'

describe('Instagram appeal templates', () => {
  it('builds template 1 from the record and linked account', () => {
    const result = buildInstagramAppealTemplate({
      template: 1,
      country: '美国',
      ip: '1.1.1.1\n2001:db8::1',
      account: {
        account: 'viral_war_room',
        emailAccount: 'r3kszdz7@clowtmail.com',
      },
      random: () => 0,
    })

    expect(result).toBe(`$instagram-ip-appeal
正确位置：美国
误判位置：其他国家
用户名：viral_war_room
注册邮箱：r3kszdz7@clowtmail.com
姓名：Olivia Carter

ip
1.1.1.1
2001:db8::1`)
  })

  it('builds template 2 without account details', () => {
    const result = buildInstagramAppealTemplate({
      template: 2,
      country: '日本',
      ip: '203.0.113.10',
      random: () => 0,
    })

    expect(result).toBe(`$instagram-location-restriction-appeal
正确位置：日本
误判位置：其他国家
姓名：Olivia Carter

ip
203.0.113.10`)
  })

  it('builds template 3 from the record and linked account', () => {
    const result = buildInstagramAppealTemplate({
      template: 3,
      country: '美国',
      ip: '1.1.1.1\n2001:db8::1',
      account: {
        account: ' appeal\\_user ',
        emailAccount: ' mailto:appeal\\@example.com ',
      },
    })

    expect(result).toBe(`$instagram-location-appeal-template3
正确位置：美国
用户名：appeal_user
注册邮箱：appeal@example.com

ip
1.1.1.1
2001:db8::1`)
  })

  it('requires a linked account for template 1', () => {
    expect(() =>
      buildInstagramAppealTemplate({
        template: 1,
        country: '美国',
        ip: '1.1.1.1',
        random: () => 0,
      }),
    ).toThrow('模板 1 需要先关联账号')
  })

  it('requires a linked account for template 3', () => {
    expect(() =>
      buildInstagramAppealTemplate({
        template: 3,
        country: '美国',
        ip: '1.1.1.1',
      }),
    ).toThrow('模板 3 需要先关联账号')
  })

  it('requires a username for template 3', () => {
    expect(() =>
      buildInstagramAppealTemplate({
        template: 3,
        country: '美国',
        ip: '1.1.1.1',
        account: {
          account: '   ',
          emailAccount: 'appeal@example.com',
        },
      }),
    ).toThrow('模板 3 关联账号缺少用户名')
  })

  it('requires a registered email for template 3', () => {
    expect(() =>
      buildInstagramAppealTemplate({
        template: 3,
        country: '美国',
        ip: '1.1.1.1',
        account: {
          account: 'appeal_user',
          emailAccount: ' mailto: ',
        },
      }),
    ).toThrow('模板 3 关联账号缺少注册邮箱')
  })

  it('uses the same English name for templates 1 and 2 of one account', () => {
    const account = {
      id: 'account-1',
      account: 'viral_war_room',
      emailAccount: 'r3kszdz7@clowtmail.com',
    }
    const template1 = buildInstagramAppealTemplate({
      template: 1,
      country: '美国',
      ip: '1.1.1.1',
      account,
      nameKey: account.id,
      random: () => 0,
    })
    const template2 = buildInstagramAppealTemplate({
      template: 2,
      country: '美国',
      ip: '1.1.1.1',
      account,
      nameKey: account.id,
      random: () => 0.999,
    })
    expect(readName(template1)).toBe(readName(template2))
  })
})

function readName(template: string): string {
  return template.match(/^姓名：(.+)$/m)?.[1] ?? ''
}
