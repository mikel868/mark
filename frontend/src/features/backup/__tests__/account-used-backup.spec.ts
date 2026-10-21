import { describe, expect, it } from 'vitest'

import { parseBackup } from '../backup-service'

describe('account used state in backups', () => {
  it('defaults legacy accounts to unused and preserves explicit used state', () => {
    const now = new Date().toISOString()
    const account = {
      platformId: 'ins' as const,
      createdAt: now,
      updatedAt: now,
      archived: false,
      country: '美国',
      password: 'password',
      emailAccount: 'account@example.com',
      emailPassword: 'mail-password',
      twoFactor: 'ACCOUNT2FA',
      note: '',
    }
    const backup = parseBackup(
      JSON.stringify({
        format: 'platform-appeal-manager-backup',
        version: 1,
        exportedAt: now,
        data: {
          accounts: [
            { ...account, id: 'legacy-account', account: 'legacy-account' },
            { ...account, id: 'used-account', account: 'used-account', used: true },
          ],
          appealModules: [],
          appealSteps: [],
          appealRecords: [],
        },
      }),
    )

    expect(backup.data.accounts.map(({ used }) => used)).toEqual([false, true])
  })
})
