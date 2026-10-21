export type InstagramTemplateNumber = 1 | 2 | 3

interface InstagramTemplateAccount {
  account: string
  emailAccount: string
}

interface InstagramAppealTemplateInput {
  template: InstagramTemplateNumber
  country: string
  ip: string
  account?: InstagramTemplateAccount
  nameKey?: string
  random?: () => number
}

const firstNames = [
  'Olivia',
  'Emma',
  'Sophia',
  'Amelia',
  'Charlotte',
  'James',
  'Henry',
  'William',
  'Daniel',
  'Thomas',
] as const

const lastNames = [
  'Carter',
  'Bennett',
  'Morgan',
  'Parker',
  'Collins',
  'Foster',
  'Reed',
  'Hayes',
  'Brooks',
  'Turner',
] as const

export function buildInstagramAppealTemplate({
  template,
  country,
  ip,
  account,
  nameKey,
  random = Math.random,
}: InstagramAppealTemplateInput): string {
  if (template === 3) {
    const normalizedAccount = requireTemplateAccount(template, account)
    return [
      '$instagram-location-appeal-template3',
      `正确位置：${country}`,
      `用户名：${normalizedAccount.username}`,
      `注册邮箱：${normalizedAccount.registeredEmail}`,
      '',
      'ip',
      ip,
    ].join('\n')
  }

  const fullName = nameKey
    ? `${pickStable(firstNames, `first:${nameKey}`)} ${pickStable(lastNames, `last:${nameKey}`)}`
    : `${pick(firstNames, random)} ${pick(lastNames, random)}`

  if (template === 1) {
    if (!account) throw new Error('模板 1 需要先关联账号')

    return [
      '$instagram-ip-appeal',
      `正确位置：${country}`,
      '误判位置：其他国家',
      `用户名：${account.account}`,
      `注册邮箱：${account.emailAccount.replace(/^mailto:/i, '')}`,
      `姓名：${fullName}`,
      '',
      'ip',
      ip,
    ].join('\n')
  }

  return [
    '$instagram-location-restriction-appeal',
    `正确位置：${country}`,
    '误判位置：其他国家',
    `姓名：${fullName}`,
    '',
    'ip',
    ip,
  ].join('\n')
}

function pick<T>(values: readonly T[], random: () => number): T {
  const index = Math.min(values.length - 1, Math.floor(random() * values.length))
  return values[Math.max(0, index)]!
}

function pickStable<T>(values: readonly T[], key: string): T {
  let hash = 0
  for (const character of key) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return values[hash % values.length]!
}

function normalizeSkillField(value: string): string {
  return value
    .replace(/\\([@_])/g, '$1')
    .replace(/&(?:#x20|#32|nbsp);/gi, ' ')
    .trim()
}

function requireTemplateAccount(
  template: 3,
  account?: InstagramTemplateAccount,
): { username: string; registeredEmail: string } {
  if (!account) throw new Error(`模板 ${template} 需要先关联账号`)

  const username = normalizeSkillField(account.account)
  const registeredEmail = normalizeSkillField(account.emailAccount)
    .replace(/^mailto:\s*/i, '')
    .trim()
  if (!username) throw new Error(`模板 ${template} 关联账号缺少用户名`)
  if (!registeredEmail) throw new Error(`模板 ${template} 关联账号缺少注册邮箱`)
  return { username, registeredEmail }
}
