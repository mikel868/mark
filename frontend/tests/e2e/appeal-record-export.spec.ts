import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { loginAsAdmin } from './login'

async function addRecord(page: Page, country: string, ips: string) {
  await page.getByRole('button', { name: '增加一行记录' }).click()
  const dialog = page.getByRole('dialog', { name: '新增申诉记录' })
  await dialog.locator('.el-form-item').filter({ hasText: '国家' }).locator('input').fill(country)
  await dialog.locator('.el-form-item').filter({ hasText: 'IP 地址' }).locator('textarea').fill(ips)
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(dialog).toBeHidden()
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/ins/appeal-records')
})

test('exports checked green IPs as country and IP rows', async ({ page }) => {
  await addRecord(page, '美国', '203.0.113.0/24\n198.51.100.0/24')
  await addRecord(page, '日本', '192.0.2.10')

  const usRow = page.getByRole('row').filter({ hasText: '203.0.113.0/24' })
  const japanRow = page.getByRole('row').filter({ hasText: '192.0.2.10' })
  await usRow.getByRole('checkbox', { name: '标记 IP 198.51.100.0/24 为完成' }).check()
  await japanRow.getByRole('checkbox', { name: '标记 IP 192.0.2.10 为完成' }).check()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出已勾选 IP' }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()

  expect(download.suggestedFilename()).toMatch(/^ins-completed-ips-\d{4}-\d{2}-\d{2}\.tsv$/)
  expect(downloadPath).not.toBeNull()
  const content = (await readFile(downloadPath!, 'utf8')).replace(/^\uFEFF/, '')
  const lines = content.split(/\r?\n/).sort()
  expect(lines).toEqual(['日本\t192.0.2.10', '美国\t198.51.100.0/24'].sort())
  expect(content).not.toContain('203.0.113.0/24')
  await expect(page.getByText('已导出 2 个已勾选 IP')).toBeVisible()
})

test('shows a message when no IP is checked', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const exportButton = page.getByRole('button', { name: '导出已勾选 IP' })
  await expect(exportButton).toBeVisible()
  await exportButton.click()
  await expect(page.getByText('暂无已勾选的 IP')).toBeVisible()
})
