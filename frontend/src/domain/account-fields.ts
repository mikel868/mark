import type { PlatformId } from './platform'

export type AccountFieldKey =
  | 'country'
  | 'account'
  | 'password'
  | 'emailAccount'
  | 'emailPassword'
  | 'token'
  | 'decodeLink'
  | 'twoFactor'

export interface AccountFieldDefinition {
  key: AccountFieldKey
  label: string
  width: number
  example: string
}

const standardFields: Record<AccountFieldKey, Omit<AccountFieldDefinition, 'label'>> = {
  country: { key: 'country', width: 80, example: '美国' },
  account: { key: 'account', width: 125, example: 'demo-user' },
  password: { key: 'password', width: 135, example: 'account-password' },
  emailAccount: { key: 'emailAccount', width: 160, example: 'demo@example.com' },
  emailPassword: { key: 'emailPassword', width: 130, example: 'email-password' },
  token: { key: 'token', width: 75, example: 'KR' },
  decodeLink: {
    key: 'decodeLink',
    width: 160,
    example: 'https://decoder.example.com/pickup?email=demo@example.com',
  },
  twoFactor: { key: 'twoFactor', width: 150, example: 'ABC123' },
}

function field(key: AccountFieldKey, label: string): AccountFieldDefinition {
  return { ...standardFields[key], label }
}

const accountFieldsByPlatform: Record<PlatformId, readonly AccountFieldDefinition[]> = {
  ins: [
    field('country', '国家'),
    field('account', '账号'),
    field('password', '密码'),
    field('emailAccount', '邮箱账号'),
    field('emailPassword', '邮箱密码'),
    field('twoFactor', '2FA'),
  ],
  google: [
    field('country', '地区'),
    field('account', '账号'),
    field('password', '密码'),
    field('twoFactor', '2FA'),
    field('emailAccount', '邮箱账号'),
  ],
  tiktok: [
    field('country', '地区'),
    field('account', '账号'),
    field('password', '密码'),
    field('emailAccount', '邮箱账号'),
    field('emailPassword', '邮箱密码'),
    field('token', '令牌'),
    field('decodeLink', '解码连接'),
  ],
  ping0: [
    field('country', '国家'),
    field('account', '账号'),
    field('password', '密码'),
    field('emailAccount', '邮箱账号'),
    field('emailPassword', '邮箱密码'),
    field('twoFactor', '2FA'),
  ],
}

export function getAccountFields(platformId: PlatformId): readonly AccountFieldDefinition[] {
  return accountFieldsByPlatform[platformId]
}

export function getAccountLocationLabel(platformId: PlatformId): string {
  return getAccountFields(platformId)[0]?.label ?? '国家'
}
