import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('replaces server data from a validated backup without the HTTPS-only randomUUID API', async ({
  page,
}) => {
  await loginAsAdmin(page)
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true })
  })
  await page.goto('/ins/backup')
  expect(await page.evaluate(() => typeof window.crypto.randomUUID)).toBe('undefined')

  const now = new Date().toISOString()
  const backup = {
    format: 'platform-appeal-manager-backup',
    version: 1,
    exportedAt: now,
    data: {
      accounts: [
        {
          id: 'restored-account-id',
          platformId: 'ins',
          country: '美国',
          account: 'restored-from-backup',
          password: 'restored-password',
          emailAccount: 'restored@example.com',
          emailPassword: 'restored-email-password',
          twoFactor: 'RESTORED2FA',
          note: '',
          createdAt: now,
          updatedAt: now,
          archived: false,
        },
      ],
      appealModules: [],
      appealSteps: [],
      appealRecords: [],
    },
  }

  await page.locator('input[type="file"]').setInputFiles({
    name: 'valid-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })

  await expect(page.getByText('账号 1')).toBeVisible()
  await page.getByRole('button', { name: '替换并恢复' }).click()
  await page
    .getByRole('dialog', { name: '确认恢复备份' })
    .getByRole('button', { name: '替换并恢复' })
    .click()

  await expect(page.locator('.el-message').last()).toHaveText('备份恢复完成')
  await page.goto('/ins/accounts')
  await expect(page.getByRole('cell', { name: 'restored-from-backup' })).toBeVisible()
})
