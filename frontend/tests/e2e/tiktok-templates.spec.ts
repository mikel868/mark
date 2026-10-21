import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

test('copies the two fixed TikTok appeal templates from record data', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })

  await page.goto('/tiktok/accounts')
  await page.getByRole('button', { name: '增加一行账号' }).click()

  const accountDialog = page.getByRole('dialog')
  const accountInputs = accountDialog.locator('input')
  await accountInputs.nth(0).fill('韩国')
  await accountInputs.nth(1).fill('oqym11')
  await accountInputs.nth(2).fill('account-password')
  await accountInputs.nth(3).fill('uhjjmzgcb8341@outlook.com')
  await accountInputs.nth(4).fill('email-password')
  await accountInputs.nth(5).fill('TOKEN123')
  await accountInputs.nth(6).fill('https://decoder.example.test/oqym11')
  await accountDialog.getByRole('button', { name: '保存' }).click()
  await expect(accountDialog).toBeHidden()

  await page.goto('/tiktok/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()

  const recordDialog = page.getByRole('dialog')
  await expect(recordDialog.getByText('TikTok 模板已固定')).toBeVisible()
  await expect(recordDialog.locator('.el-form-item').filter({ hasText: '模板 1' })).toHaveCount(0)
  await expect(recordDialog.locator('.el-form-item').filter({ hasText: '模板 2' })).toHaveCount(0)
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: '国家' })
    .locator('input')
    .fill('韩国')
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: 'IP 地址' })
    .locator('textarea')
    .fill(
      '195.86.243.0/24\n195.86.217.0/24\n195.86.115.0/24\n72.57.182.0/24\n72.57.183.0/24\n72.57.184.0/24',
    )
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: '关联账号' })
    .getByRole('combobox')
    .click()
  await page.getByRole('option', { name: 'oqym11 · 韩国 · 0 次申诉' }).click()
  await recordDialog.getByRole('button', { name: '保存' }).click()

  const expectedDetails = `正确国家：韩国
TikTok 用户名：oqym11
联系邮箱：uhjjmzgcb8341@outlook.com

Ip
195.86.243.0/24
195.86.217.0/24
195.86.115.0/24
72.57.182.0/24
72.57.183.0/24
72.57.184.0/24`
  const recordRow = page.getByRole('row').filter({ hasText: 'oqym11' })

  await recordRow.getByRole('button', { name: '复制 1' }).click()
  await expect
    .poll(() => readClipboard(page))
    .toBe(`$tiktok-ip-geolocation-appeal\n${expectedDetails}`)

  await recordRow.getByRole('button', { name: '复制 2' }).click()
  await expect
    .poll(() => readClipboard(page))
    .toBe(`$tiktok-ip-geolocation-appeal2\n${expectedDetails}`)
})

async function readClipboard(page: import('@playwright/test').Page): Promise<string> {
  return (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
}
