import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('removes the account success rate module and redirects its former route', async ({ page }) => {
  await loginAsAdmin(page)

  await expect(page.getByRole('button', { name: '账号成功率' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '04 备份恢复' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '菜单' }).click()
  await expect(page.getByRole('dialog', { name: '功能导航' })).toBeVisible()
  await expect(page.getByRole('button', { name: '账号成功率' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '04 备份恢复' })).toBeVisible()

  await page.goto('/ins/success-rate')
  await expect(page).toHaveURL(/\/ins\/accounts$/)
  await expect(page.getByRole('heading', { name: 'INS · 账号管理' })).toBeVisible()
})
