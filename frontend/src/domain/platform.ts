export const platformIds = ['ins', 'google', 'tiktok', 'ping0'] as const

export type PlatformId = (typeof platformIds)[number]

export interface PlatformDefinition {
  id: PlatformId
  label: string
  shortLabel: string
  description: string
  accent: string
}

export const platforms: PlatformDefinition[] = [
  {
    id: 'ins',
    label: 'INS',
    shortLabel: 'IN',
    description: 'Instagram 账号与申诉资料',
    accent: '#d63384',
  },
  {
    id: 'google',
    label: 'Google',
    shortLabel: 'GO',
    description: 'Google 账号与申诉资料',
    accent: '#4285f4',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    shortLabel: 'TK',
    description: 'TikTok 账号与申诉资料',
    accent: '#111827',
  },
  {
    id: 'ping0',
    label: 'Ping0',
    shortLabel: 'P0',
    description: 'Ping0 账号与申诉资料',
    accent: '#facc15',
  },
]

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && platformIds.includes(value as PlatformId)
}

export function getPlatform(platformId: PlatformId): PlatformDefinition {
  return platforms.find((platform) => platform.id === platformId) ?? platforms[0]
}
