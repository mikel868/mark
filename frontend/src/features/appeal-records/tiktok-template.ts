export type TikTokTemplateNumber = 1 | 2

interface TikTokTemplateAccount {
  account: string
  emailAccount: string
}

interface TikTokAppealTemplateInput {
  template: TikTokTemplateNumber
  country: string
  ip: string
  account?: TikTokTemplateAccount
}

const skillByTemplate: Record<TikTokTemplateNumber, string> = {
  1: '$tiktok-ip-geolocation-appeal',
  2: '$tiktok-ip-geolocation-appeal2',
}

export function buildTikTokAppealTemplate({
  template,
  country,
  ip,
  account,
}: TikTokAppealTemplateInput): string {
  if (!account) throw new Error(`模板 ${template} 需要先关联账号`)

  const normalizedCountry = normalizeSkillField(country)
  const username = normalizeSkillField(account.account)
  const contactEmail = normalizeSkillField(account.emailAccount)
    .replace(/^mailto:\s*/i, '')
    .trim()
  const ipList = ip.trim()

  if (!normalizedCountry) throw new Error(`模板 ${template} 缺少正确国家`)
  if (!username) throw new Error(`模板 ${template} 关联账号缺少 TikTok 用户名`)
  if (!contactEmail) throw new Error(`模板 ${template} 关联账号缺少联系邮箱`)
  if (!ipList) throw new Error(`模板 ${template} 缺少 IP`)

  return [
    skillByTemplate[template],
    `正确国家：${normalizedCountry}`,
    `TikTok 用户名：${username}`,
    `联系邮箱：${contactEmail}`,
    '',
    'Ip',
    ipList,
  ].join('\n')
}

function normalizeSkillField(value: string): string {
  return value
    .replace(/\\([@_])/g, '$1')
    .replace(/&(?:#x20|#32|nbsp);/gi, ' ')
    .trim()
}
