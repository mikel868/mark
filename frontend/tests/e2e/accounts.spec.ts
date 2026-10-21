import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

test('creates a TikTok account and keeps it out of Google', async ({ page }) => {
  await page.goto('/tiktok/accounts')
  await page.getByRole('button', { name: '增加一行账号' }).click()

  const dialog = page.getByRole('dialog')
  const inputs = dialog.locator('input')
  await expect(inputs.nth(2)).toHaveAttribute('type', 'text')
  await expect(inputs.nth(4)).toHaveAttribute('type', 'text')
  await inputs.nth(0).fill('美国')
  await inputs.nth(1).fill('tiktok-demo')
  await inputs.nth(2).fill('account-password')
  await inputs.nth(3).fill('demo@example.com')
  await inputs.nth(4).fill('email-password')
  await inputs.nth(5).fill('KR')
  await inputs.nth(6).fill('https://decoder.example.test/tiktok-demo')
  await dialog.getByRole('button', { name: '保存' }).click()

  await expect(page.getByText('tiktok-demo', { exact: true })).toBeVisible()
  await expect(page.getByText('account-password', { exact: true })).toBeVisible()
  await expect(page.getByText('email-password', { exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '2FA' })).toHaveCount(0)

  await page.getByRole('button', { name: /Google/ }).click()
  await expect(page).toHaveURL(/\/google\/accounts$/)
  await expect(page.getByText('tiktok-demo')).toHaveCount(0)
})

test('batch imports a Markdown account table into the current platform', async ({ page }) => {
  await page.goto('/ins/accounts')
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea').fill(`|国家|账号|密码|邮箱账号|邮箱密码|2fa|
|---|---|---|---|---|---|
|美国|batch\\_one|password-one|mailto:one\\@example.com|mail-one|ONE2FA|
|日本|batch-two|password-two|two@example.com|mail-two|TWO2FA|`)

  await expect(dialog.getByText('可导入 2 行')).toBeVisible()
  await dialog.getByRole('button', { name: '确认导入 2 行' }).click()

  await expect(page.getByRole('cell', { name: 'batch_one' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'batch-two' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'one@example.com' })).toBeVisible()
})

test('paginates account management after every ten rows', async ({ page }) => {
  await page.goto('/ins/accounts')
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const rows = Array.from({ length: 11 }, (_, index) => {
    const rowNumber = String(index + 1).padStart(2, '0')
    return `|美国|page-user-${rowNumber}|password-${rowNumber}|page-${rowNumber}@example.com|mail-${rowNumber}|2FA-${rowNumber}|`
  }).join('\n')

  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea').fill(`|国家|账号|密码|邮箱账号|邮箱密码|2fa|
|---|---|---|---|---|---|
${rows}`)
  await expect(dialog.getByText('可导入 11 行')).toBeVisible()
  await dialog.getByRole('button', { name: '确认导入 11 行' }).click()

  const tableRows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(tableRows).toHaveCount(10)

  const pagination = page.locator('.el-pagination')
  await expect(pagination).toBeVisible()
  await pagination.locator('.number').filter({ hasText: '2' }).click()
  await expect(tableRows).toHaveCount(1)

  await page.getByPlaceholder('搜索账号、邮箱或国家').fill('page-user-01')
  await expect(page.getByText('page-user-01', { exact: true })).toBeVisible()
})

test('keeps long account values inside fixed copy fields', async ({ page }) => {
  const longAccount = `account-${'1234567890'.repeat(8)}`
  const longPassword = `password-${'abcdefghij'.repeat(8)}`
  const longEmail = `${'mail'.repeat(16)}@example.com`
  const longEmailPassword = `email-password-${'9876543210'.repeat(7)}`
  const longTwoFactor = `2FA-${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(4)}`

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/ins/accounts')
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea').fill(`|国家|账号|密码|邮箱账号|邮箱密码|2fa|
|---|---|---|---|---|---|
|美国|${longAccount}|${longPassword}|${longEmail}|${longEmailPassword}|${longTwoFactor}|`)
  await dialog.getByRole('button', { name: '确认导入 1 行' }).click()

  const copyFields = page.locator('.el-table__body-wrapper tbody tr').first().locator('.copy-field')
  await expect(copyFields).toHaveCount(5)
  await expect(copyFields.nth(4).locator('.copy-field__value')).toHaveText(longTwoFactor)

  const accountValue = copyFields.nth(0).locator('.copy-field__value')
  await expect(accountValue).toHaveCSS('overflow', 'hidden')
  await expect(accountValue).toHaveCSS('text-overflow', 'ellipsis')
  await expect(accountValue).toHaveCSS('white-space', 'nowrap')
  expect(await accountValue.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  )

  await expect(copyFields.nth(0).getByRole('button', { name: '复制账号' })).toBeVisible()

  const twoFactorField = copyFields.nth(4)
  await twoFactorField.scrollIntoViewIfNeeded()
  const twoFactorCopyButton = twoFactorField.getByRole('button', { name: '复制2FA' })
  await expect(twoFactorCopyButton).toBeVisible()
  await twoFactorCopyButton.click()
})

test('shows missing batch-import fields on mobile without blocking import', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/ins/accounts')
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea').fill(`|国家|账号|密码|邮箱账号|2fa|
|---|---|---|---|---|
|美国|mobile-user|password|mobile@example.com|MOBILE2FA|`)

  const mobileRow = dialog.locator('.mobile-import-row')
  await expect(mobileRow).toBeVisible()
  await expect(mobileRow.getByText('缺少：邮箱密码')).toBeVisible()

  const confirm = dialog.getByRole('button', { name: '确认导入 1 行' })
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByRole('cell', { name: 'mobile-user' })).toBeVisible()
})
