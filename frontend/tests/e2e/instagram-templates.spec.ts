import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

test('copies the three fixed INS appeal templates from record data', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })

  await page.goto('/ins/accounts')
  await page.getByRole('button', { name: '增加一行账号' }).click()

  const accountDialog = page.getByRole('dialog')
  const accountInputs = accountDialog.locator('input')
  await accountInputs.nth(0).fill('美国')
  await accountInputs.nth(1).fill('appeal-user')
  await accountInputs.nth(2).fill('account-password')
  await accountInputs.nth(3).fill('appeal@example.com')
  await accountInputs.nth(4).fill('email-password')
  await accountInputs.nth(5).fill('APPEAL2FA')
  await accountDialog.getByRole('button', { name: '保存' }).click()
  await expect(accountDialog).toBeHidden()
  await expect(page.getByRole('cell', { name: 'appeal-user' })).toBeVisible()

  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()

  const recordDialog = page.getByRole('dialog')
  await expect(recordDialog.getByText('INS 模板已固定')).toBeVisible()
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: '国家' })
    .locator('input')
    .fill('美国')
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: 'IP 地址' })
    .locator('textarea')
    .fill('1.1.1.1\n2001:db8::1')
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: '关联账号' })
    .getByRole('combobox')
    .click()
  await page.getByRole('option', { name: 'appeal-user · 美国 · 0 次申诉' }).click()
  await recordDialog.getByRole('button', { name: '保存' }).click()

  const recordRow = page.getByRole('row').filter({ hasText: 'appeal-user' })
  await recordRow.getByRole('button', { name: '复制 1' }).click()
  const template1 = (await page.evaluate(() => navigator.clipboard.readText())).replace(
    /\r\n/g,
    '\n',
  )

  expect(template1).toContain(`$instagram-ip-appeal
正确位置：美国
误判位置：其他国家
用户名：appeal-user
注册邮箱：appeal@example.com`)
  expect(template1).toMatch(/姓名：[A-Z][a-z]+ [A-Z][a-z]+\n\nip\n1\.1\.1\.1\n2001:db8::1$/)

  await recordRow.getByRole('button', { name: '复制 2' }).click()
  const template2 = (await page.evaluate(() => navigator.clipboard.readText())).replace(
    /\r\n/g,
    '\n',
  )

  expect(template2).toContain(`$instagram-location-restriction-appeal
正确位置：美国
误判位置：其他国家`)
  expect(template2).not.toContain('用户名：')
  expect(template2).not.toContain('注册邮箱：')
  expect(template2).toMatch(/姓名：[A-Z][a-z]+ [A-Z][a-z]+\n\nip\n1\.1\.1\.1\n2001:db8::1$/)
  expect(readName(template2)).toBe(readName(template1))

  await recordRow.getByRole('button', { name: '复制 3' }).click()
  const template3 = (await page.evaluate(() => navigator.clipboard.readText())).replace(
    /\r\n/g,
    '\n',
  )

  expect(template3).toBe(`$instagram-location-appeal-template3
正确位置：美国
用户名：appeal-user
注册邮箱：appeal@example.com

ip
1.1.1.1
2001:db8::1`)

  await expect(recordRow.getByRole('button', { name: '复制 4' })).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  const copyTemplate3Button = recordRow.getByRole('button', { name: '复制 3' })
  await copyTemplate3Button.scrollIntoViewIfNeeded()
  await expect(copyTemplate3Button).toBeVisible()
})

test('keeps editable template fields on non-INS platforms', async ({ page }) => {
  await page.goto('/google/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('INS 模板已固定')).toHaveCount(0)
  await expect(dialog.locator('.el-form-item').filter({ hasText: '模板 1' })).toBeVisible()
  await expect(dialog.locator('.el-form-item').filter({ hasText: '模板 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制 3' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '复制 4' })).toHaveCount(0)
})

test('explains when a linked INS account cannot supply account-based templates', async ({
  page,
}) => {
  await page.goto('/ins/accounts')
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const importDialog = page.getByRole('dialog')
  await importDialog.locator('textarea').fill(`|国家|账号|密码|邮箱账号|邮箱密码|2fa|
|---|---|---|---|---|---|
|美国|missing-email|password||email-password|MISSING2FA|`)
  await importDialog.getByRole('button', { name: '确认导入 1 行' }).click()
  await expect(importDialog).toBeHidden()
  await expect(page.getByText('missing-email', { exact: true })).toBeVisible()

  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()

  const recordDialog = page.getByRole('dialog')
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: '国家' })
    .locator('input')
    .fill('美国')
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: 'IP 地址' })
    .locator('textarea')
    .fill('203.0.113.10')
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: '关联账号' })
    .getByRole('combobox')
    .click()
  await page.getByRole('option', { name: 'missing-email · 美国 · 0 次申诉' }).click()
  await recordDialog.getByRole('button', { name: '保存' }).click()

  const recordRow = page.getByRole('row').filter({ hasText: 'missing-email' })
  await recordRow.getByRole('button', { name: '复制 3' }).click()
  await expect(page.getByText('模板 3 关联账号缺少注册邮箱')).toBeVisible()
})

function readName(template: string): string {
  return template.match(/^姓名：(.+)$/m)?.[1] ?? ''
}
