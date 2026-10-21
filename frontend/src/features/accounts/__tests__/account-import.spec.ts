import { describe, expect, it } from 'vitest'

import { parseAccountImport } from '../account-import'

describe('account import parser', () => {
  it('parses a Markdown table and normalizes Markdown escapes and mailto links', () => {
    const result = parseAccountImport(
      `|国家|账号|密码|邮箱账号|邮箱密码|2fa|
|---|---|---|---|---|---|
|美国|demo\\_account|secret|mailto:demo\\@example.com|mail-secret|AAAA BBBB|`,
      'ins',
    )

    expect(result.error).toBe('')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      lineNumber: 3,
      errors: [],
      input: {
        platformId: 'ins',
        country: '美国',
        account: 'demo_account',
        password: 'secret',
        emailAccount: 'demo@example.com',
        emailPassword: 'mail-secret',
        twoFactor: 'AAAA BBBB',
        note: '',
      },
    })
  })

  it('parses tab-separated rows copied from a spreadsheet', () => {
    const result = parseAccountImport(
      '国家\t账号\t密码\t邮箱账号\t邮箱密码\t2FA\n日本\tdemo-user\tsecret\tdemo@example.com\tmail-secret\tABC123',
      'google',
    )

    expect(result.error).toBe('')
    expect(result.rows[0]?.input?.platformId).toBe('google')
    expect(result.rows[0]?.input?.country).toBe('日本')
  })

  it('parses quoted CSV fields', () => {
    const result = parseAccountImport(
      '国家,账号,密码,邮箱账号,邮箱密码,2FA\n"美国,华盛顿",demo-user,secret,demo@example.com,mail-secret,ABC123',
      'tiktok',
    )

    expect(result.error).toBe('')
    expect(result.rows[0]?.input?.country).toBe('美国,华盛顿')
  })

  it('preserves literal backslashes outside Markdown tables', () => {
    const result = parseAccountImport(
      '国家\t账号\t密码\t邮箱账号\t邮箱密码\t2FA\n美国\tdemo\\_user\tsecret\tdemo@example.com\tmail\\@secret\tABC123',
      'ins',
    )

    expect(result.rows[0]?.input?.account).toBe('demo\\_user')
    expect(result.rows[0]?.input?.emailPassword).toBe('mail\\@secret')
  })

  it('preserves literal quote characters in tab-separated credentials', () => {
    const result = parseAccountImport(
      '国家\t账号\t密码\t邮箱账号\t邮箱密码\t2FA\n美国\tdemo-user\t"quoted-password"\tdemo@example.com\tmail-secret\tABC123',
      'ins',
    )

    expect(result.rows[0]?.input?.password).toBe('"quoted-password"')
  })

  it('preserves an escaped pipe at the end of a Markdown field', () => {
    const result = parseAccountImport(
      `|国家|账号|密码|邮箱账号|邮箱密码|2fa
|---|---|---|---|---|---
|美国|demo-user|secret|demo@example.com|mail-secret|ABC\\|`,
      'ins',
    )

    expect(result.rows[0]?.input?.twoFactor).toBe('ABC|')
  })

  it('allows missing field values and reports exactly what is missing', () => {
    const result = parseAccountImport(
      `|国家|账号|密码|邮箱账号|邮箱密码|2fa|
|---|---|---|---|---|---|
|美国|demo-user|secret|demo@example.com| |ABC123|`,
      'ins',
    )

    expect(result.error).toBe('')
    expect(result.rows[0]?.errors).toEqual([])
    expect(result.rows[0]?.missingFields).toEqual(['邮箱密码'])
    expect(result.rows[0]?.input).toMatchObject({
      account: 'demo-user',
      emailPassword: '',
    })
  })

  it('allows missing columns and reports them for each row', () => {
    const result = parseAccountImport('国家,账号,密码\n美国,demo-user,secret', 'ping0')

    expect(result.error).toBe('')
    expect(result.rows[0]?.errors).toEqual([])
    expect(result.rows[0]?.missingFields).toEqual(['邮箱账号', '邮箱密码', '2FA'])
    expect(result.rows[0]?.input).toMatchObject({
      country: '美国',
      account: 'demo-user',
      password: 'secret',
      emailAccount: '',
      emailPassword: '',
      twoFactor: '',
    })
  })

  it('rejects a table whose header has no recognizable account fields', () => {
    const result = parseAccountImport('名称,内容\n测试,数据', 'ins')

    expect(result.rows).toEqual([])
    expect(result.error).toContain('没有识别到账号字段')
  })

  it('imports the Google field set without an email-password column', () => {
    const result = parseAccountImport(
      `|地区|账号|密码|2fa|邮箱账号|
|---|---|---|---|---|
|美国|google-user|secret|GOOGLE2FA|google@example.com|`,
      'google',
    )

    expect(result.error).toBe('')
    expect(result.rows[0]?.errors).toEqual([])
    expect(result.rows[0]?.input).toMatchObject({
      platformId: 'google',
      country: '美国',
      account: 'google-user',
      emailAccount: 'google@example.com',
      emailPassword: '',
      twoFactor: 'GOOGLE2FA',
    })
  })

  it('imports the TikTok field set without a 2FA column', () => {
    const result = parseAccountImport(
      `地区,账号,密码,邮箱账号,邮箱密码
美国,tiktok-user,secret,tiktok@example.com,email-secret`,
      'tiktok',
    )

    expect(result.error).toBe('')
    expect(result.rows[0]?.errors).toEqual([])
    expect(result.rows[0]?.input).toMatchObject({
      platformId: 'tiktok',
      country: '美国',
      account: 'tiktok-user',
      emailAccount: 'tiktok@example.com',
      emailPassword: 'email-secret',
      twoFactor: '',
    })
  })

  it('parses the TikTok delimiter template with a Markdown decode link and trailing country', () => {
    const result = parseAccountImport(
      'sample-user----account-pass----sample\\@outlook.com----mail-pass----[https://decoder.example.test/pickup?email=sample@outlook.com----KR](https://decoder.example.test/pickup?email=sample@outlook.com----KR)\\',
      'tiktok',
    )

    expect(result.error).toBe('')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      lineNumber: 1,
      errors: [],
      missingFields: [],
      input: {
        platformId: 'tiktok',
        country: '韩国',
        account: 'sample-user',
        password: 'account-pass',
        emailAccount: 'sample@outlook.com',
        emailPassword: 'mail-pass',
        token: '',
        decodeLink: 'https://decoder.example.test/pickup?email=sample@outlook.com',
        twoFactor: '',
        note: '',
      },
    })
  })

  it('removes spaced delimiters before a TikTok country and leaves the optional token empty', () => {
    const result = parseAccountImport(
      'thai-import-user ---- Account441298*= ---- thai-user@example.test ---- mail-pass ---- [http://decoder.example.test:8128/api/pickup?email=thai-user@example.test](http://decoder.example.test:8128/api/pickup?email=thai-user@example.test) ---- 泰国',
      'tiktok',
    )

    expect(result.error).toBe('')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      errors: [],
      missingFields: [],
      input: {
        platformId: 'tiktok',
        country: '泰国',
        account: 'thai-import-user',
        password: 'Account441298*=',
        emailAccount: 'thai-user@example.test',
        emailPassword: 'mail-pass',
        token: '',
        decodeLink: 'http://decoder.example.test:8128/api/pickup?email=thai-user@example.test',
      },
    })
  })

  it('accepts token before the decode link in the TikTok delimiter template', () => {
    const result = parseAccountImport(
      'sample-user----account-pass----sample@example.com----mail-pass----TOKEN123----https://decoder.example.test/pickup?email=sample@example.com',
      'tiktok',
    )

    expect(result.rows[0]?.input).toMatchObject({
      token: 'TOKEN123',
      decodeLink: 'https://decoder.example.test/pickup?email=sample@example.com',
    })
  })

  it('converts a country abbreviation into a specific TikTok region', () => {
    const result = parseAccountImport(
      [
        'mx-import-user-1----Example913690**----mx-user-1@example.test----mail-pass-1----http://decoder.example.test:8128/api/pickup?email=mx-user-1@example.test----MX',
        'mx-import-user-2----Example60842++----mx-user-2@example.test----mail-pass-2----http://decoder.example.test:8128/api/pickup?email=mx-user-2@example.test----mx',
        'mx-import-user-3----Example12345==----mx-user-3@example.test----mail-pass-3----http://decoder.example.test:8128/api/pickup?email=mx-user-3@example.test----墨西哥',
      ].join('\n'),
      'tiktok',
    )

    expect(result.error).toBe('')
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toMatchObject({
      errors: [],
      missingFields: [],
      input: {
        platformId: 'tiktok',
        country: '墨西哥',
        account: 'mx-import-user-1',
        password: 'Example913690**',
        emailAccount: 'mx-user-1@example.test',
        emailPassword: 'mail-pass-1',
        token: '',
        decodeLink: 'http://decoder.example.test:8128/api/pickup?email=mx-user-1@example.test',
      },
    })
    expect(result.rows[1]?.input).toMatchObject({
      country: '墨西哥',
      account: 'mx-import-user-2',
      token: '',
      decodeLink: 'http://decoder.example.test:8128/api/pickup?email=mx-user-2@example.test',
    })
    expect(result.rows[2]?.input).toMatchObject({
      country: '墨西哥',
      account: 'mx-import-user-3',
      token: '',
      decodeLink: 'http://decoder.example.test:8128/api/pickup?email=mx-user-3@example.test',
    })
  })
})
