import { describe, expect, it } from 'vitest'

import { parseBackup } from '../backup-service'

describe('TikTok account fields in backups', () => {
  it('defaults legacy token fields and preserves imported values', () => {
    const now = new Date().toISOString()
    const baseAccount = {
      platformId: 'tiktok',
      createdAt: now,
      updatedAt: now,
      archived: false,
      used: false,
      country: '',
      password: 'account-pass',
      emailAccount: 'sample@example.com',
      emailPassword: 'mail-pass',
      twoFactor: '',
      note: '',
    }
    const backup = parseBackup(
      JSON.stringify({
        format: 'platform-appeal-manager-backup',
        version: 1,
        exportedAt: now,
        data: {
          accounts: [
            { ...baseAccount, id: 'legacy', account: 'legacy-user' },
            {
              ...baseAccount,
              id: 'current',
              account: 'current-user',
              token: 'KR',
              decodeLink: 'https://decoder.example.test/current-user',
            },
          ],
          appealModules: [],
          appealSteps: [],
          appealRecords: [],
        },
      }),
    )

    expect(backup.data.accounts).toMatchObject([
      { id: 'legacy', token: '', decodeLink: '' },
      {
        id: 'current',
        token: 'KR',
        decodeLink: 'https://decoder.example.test/current-user',
      },
    ])
  })
})
