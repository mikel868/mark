import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('keeps the desktop layout usable and shows account credentials directly', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await loginAsAdmin(page)

  await expect(page.locator('.sidebar')).toHaveCSS('width', '224px')
  await expect(page.locator('.topbar')).toHaveCSS('height', '72px')
  await expect(page.getByRole('button', { name: 'INS', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '增加一行账号' }).click()
  const accountDialog = page.getByRole('dialog', { name: '新增账号' })
  const inputs = accountDialog.locator('input')
  await inputs.nth(0).fill('美国')
  await inputs.nth(1).fill('desktop-account')
  await inputs.nth(2).fill('visible-account-password')
  await inputs.nth(3).fill('desktop@example.test')
  await inputs.nth(4).fill('visible-email-password')
  await inputs.nth(5).fill('VISIBLE2FA')
  await accountDialog.getByRole('button', { name: '保存' }).click()
  await expect(accountDialog).toBeHidden()

  const accountRow = page.getByRole('row').filter({ hasText: 'desktop-account' })
  await expect(accountRow.getByText('visible-account-password', { exact: true })).toBeVisible()
  await expect(accountRow.getByText('visible-email-password', { exact: true })).toBeVisible()
  await expect(accountRow.getByText('VISIBLE2FA', { exact: true })).toBeVisible()
  const lastAccountColumn = await page.getByRole('columnheader', { name: '操作' }).boundingBox()
  expect((lastAccountColumn?.x ?? 0) + (lastAccountColumn?.width ?? 0)).toBeLessThanOrEqual(1408)

  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()
  const recordDialog = page.getByRole('dialog', { name: '新增申诉记录' })
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: '国家' })
    .locator('input')
    .fill('美国')
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: 'IP 地址' })
    .locator('textarea')
    .fill('203.0.113.0/24')
  await recordDialog.getByRole('button', { name: '保存' }).click()

  await page
    .getByRole('row')
    .filter({ hasText: '203.0.113.0/24' })
    .getByRole('button', {
      name: '详情',
    })
    .click()
  const detail = page.getByRole('dialog', { name: '' }).filter({ hasText: '申诉记录 / 详情' })
  await expect(detail.getByText('203.0.113.0/24')).toBeVisible()
  await expect(detail.getByRole('button', { name: '管理验证 IP' })).toBeVisible()

  await page.goto('/ins/appeal-flow')
  await expect(page.getByRole('heading', { name: 'INS · 申诉流程' })).toBeVisible()
  await page.goto('/ins/backup')
  await expect(page.getByRole('heading', { name: '服务器备份与恢复' })).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('keeps the desktop appeal-flow cards interactive', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await loginAsAdmin(page)
  await page.goto('/ins/appeal-flow')

  await page.getByRole('button', { name: '增加一个模块' }).click()
  const moduleDialog = page.getByRole('dialog', { name: '新增申诉模块' })
  await moduleDialog
    .locator('.el-form-item')
    .filter({ hasText: '模块名称' })
    .locator('input')
    .fill('IP 地区纠正')
  await moduleDialog.getByRole('button', { name: '保存' }).click()
  await expect(moduleDialog).toBeHidden()

  await page.getByRole('button', { name: '增加一个步骤' }).click()
  const stepDialog = page.getByRole('dialog', { name: '新增申诉步骤' })
  await stepDialog
    .locator('.el-form-item')
    .filter({ hasText: '步骤名称' })
    .locator('input')
    .fill('整理账号与 IP')
  await stepDialog
    .locator('.el-form-item')
    .filter({ hasText: '操作说明' })
    .locator('textarea')
    .fill('核对国家与 IP 网段。')
  await stepDialog.getByRole('button', { name: '保存' }).click()
  await expect(stepDialog).toBeHidden()

  await expect(page.locator('.step-card')).toHaveCount(1)
  await expect(page.locator('.step-card')).toContainText('整理账号与 IP')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('filters appeal records from the desktop status summary', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/ins/appeal-records')

  for (const [country, ip] of [
    ['美国', '203.0.113.0/24'],
    ['日本', '198.51.100.0/24'],
  ]) {
    await page.getByRole('button', { name: '增加一行记录' }).click()
    const dialog = page.getByRole('dialog', { name: '新增申诉记录' })
    await dialog.locator('.el-form-item').filter({ hasText: '国家' }).locator('input').fill(country)
    await dialog
      .locator('.el-form-item')
      .filter({ hasText: 'IP 地址' })
      .locator('textarea')
      .fill(ip)
    await dialog.getByRole('button', { name: '保存' }).click()
    await expect(dialog).toBeHidden()
  }

  await page
    .getByRole('row')
    .filter({ hasText: '203.0.113.0/24' })
    .getByRole('checkbox', { name: '标记 IP 203.0.113.0/24 为完成' })
    .check()

  await page.getByRole('button', { name: '已完成 1' }).click()
  await expect(page.getByRole('row').filter({ hasText: '203.0.113.0/24' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '198.51.100.0/24' })).toHaveCount(0)

  await page.getByRole('button', { name: '处理中 1' }).click()
  await expect(page.getByRole('row').filter({ hasText: '198.51.100.0/24' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '203.0.113.0/24' })).toHaveCount(0)
})
