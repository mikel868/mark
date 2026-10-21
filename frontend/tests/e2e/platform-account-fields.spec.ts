import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

test('uses the Google account fields and order', async ({ page }) => {
  await page.goto('/google/accounts')
  await page.getByRole('button', { name: '增加一行账号' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.el-form-item__label')).toHaveText([
    '地区',
    '账号',
    '密码',
    '2FA',
    '邮箱账号',
    '备注',
  ])

  const inputs = dialog.locator('input')
  await expect(inputs).toHaveCount(5)
  await inputs.nth(0).fill('美国')
  await inputs.nth(1).fill('google-user')
  await inputs.nth(2).fill('google-password')
  await inputs.nth(3).fill('GOOGLE2FA')
  await inputs.nth(4).fill('google@example.com')
  await dialog.getByRole('button', { name: '保存' }).click()

  const headers = page.locator('.el-table__header th .cell')
  await expect(headers).toHaveText([
    '',
    '地区',
    '已失效',
    '账号',
    '密码',
    '2FA',
    '邮箱账号',
    '操作',
  ])
  await expect(page.getByText('GOOGLE2FA', { exact: true })).toBeVisible()
  await expect(page.getByText('google@example.com', { exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '邮箱密码' })).toHaveCount(0)
})

test('uses the TikTok account fields without 2FA', async ({ page }) => {
  await page.goto('/tiktok/accounts')
  await page.getByRole('button', { name: '增加一行账号' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.el-form-item__label')).toHaveText([
    '地区',
    '账号',
    '密码',
    '邮箱账号',
    '邮箱密码',
    '令牌',
    '解码连接',
    '备注',
  ])

  const inputs = dialog.locator('input')
  await expect(inputs).toHaveCount(7)
  await inputs.nth(0).fill('日本')
  await inputs.nth(1).fill('tiktok-user')
  await inputs.nth(2).fill('tiktok-password')
  await inputs.nth(3).fill('tiktok@example.com')
  await inputs.nth(4).fill('email-password')
  await inputs.nth(5).fill('TOKEN123')
  await inputs.nth(6).fill('https://decoder.example.test/tiktok-user')
  await dialog.getByRole('button', { name: '保存' }).click()

  const headers = page.locator('.el-table__header th .cell')
  await expect(headers).toHaveText([
    '',
    '地区',
    '已失效',
    '账号',
    '密码',
    '邮箱账号',
    '邮箱密码',
    '令牌',
    '解码连接',
    '操作',
  ])
  await expect(page.getByText('email-password', { exact: true })).toBeVisible()
  await expect(page.getByText('TOKEN123', { exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '2FA' })).toHaveCount(0)
})

test('shows platform-specific batch import columns', async ({ page }) => {
  await page.goto('/google/accounts')
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const googlePlaceholder = await page
    .getByRole('dialog')
    .locator('textarea')
    .getAttribute('placeholder')
  expect(googlePlaceholder).toContain('| 地区 | 账号 | 密码 | 2FA | 邮箱账号 |')
  expect(googlePlaceholder).not.toContain('邮箱密码')

  await page.getByRole('dialog').getByRole('button', { name: '取消' }).click()
  await page.goto('/tiktok/accounts')
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const tiktokPlaceholder = await page
    .getByRole('dialog')
    .locator('textarea')
    .getAttribute('placeholder')
  expect(tiktokPlaceholder).toContain(
    '账号 ---- 密码 ---- 邮箱 ---- 邮箱密码 ---- [解码链接](解码链接) ---- 具体地区',
  )
  expect(tiktokPlaceholder).not.toContain('2FA')
})
