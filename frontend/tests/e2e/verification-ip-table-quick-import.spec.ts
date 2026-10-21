import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('imports IP credentials and batch copies selected record data', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })
  await loginAsAdmin(page)
  await page.goto('/ins/appeal-records')

  const toolbar = page.locator('.toolbar-actions')
  const recordImportButton = toolbar.getByRole('button', { name: '快速导入', exact: true })
  await expect(recordImportButton).toBeVisible()
  await recordImportButton.click()

  const recordImportDialog = page.getByRole('dialog', { name: '快速导入申诉记录 · INS' })
  await recordImportDialog
    .locator('.el-form-item')
    .filter({ hasText: '国家' })
    .locator('input')
    .fill('美国')
  await recordImportDialog.getByRole('spinbutton').fill('1')
  await recordImportDialog
    .locator('.el-form-item')
    .filter({ hasText: '网段列表' })
    .locator('textarea')
    .fill('203.0.113.0/24\n198.51.100.0/24')
  await recordImportDialog.getByRole('button', { name: '确认生成 2 条记录' }).click()

  const credentialImportButton = toolbar.getByRole('button', { name: 'IP 账密导入', exact: true })
  await expect(credentialImportButton).toBeVisible()
  const buttonRows = await toolbar
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
    )
  expect(new Set(buttonRows).size).toBe(1)
  await credentialImportButton.click()

  const credentialImportDialog = page.getByRole('dialog', { name: '整表导入 IP 账密 · INS' })
  await credentialImportDialog
    .getByLabel('整表 IP 账密快速导入')
    .fill('203.0.113.25:6728:first-user:first-pass\n198.51.100.42:7311:second-user:second-pass')
  await expect(credentialImportDialog.getByText('已匹配 2 个网段')).toBeVisible()
  await expect(credentialImportDialog.getByText('将更新 2 条记录')).toBeVisible()
  await credentialImportDialog.getByRole('button', { name: '确认写入 2 条记录' }).click()
  await expect(page.getByText('已更新 2 个匹配项；格式错误 0 行，未匹配 0 行')).toBeVisible()

  const recordRows = page.locator('.el-table__body-wrapper tbody tr')
  const displayedNetworks = await recordRows.locator('.ip-item span').allTextContents()
  await recordRows.nth(0).locator('td').first().locator('.el-checkbox').click()
  await recordRows.nth(1).locator('td').first().locator('.el-checkbox').click()
  await expect(page.getByText('已选择 2 条申诉记录')).toBeVisible()

  await page.getByRole('button', { name: '批量复制 IP', exact: true }).click()
  await expect.poll(() => readClipboard(page)).toBe(displayedNetworks.join('\n'))

  await page.getByRole('button', { name: '批量复制 IP 账密', exact: true }).click()
  const credentialByNetwork = new Map([
    ['203.0.113.0/24', '203.0.113.25:6728:first-user:first-pass'],
    ['198.51.100.0/24', '198.51.100.42:7311:second-user:second-pass'],
  ])
  await expect
    .poll(() => readClipboard(page))
    .toBe(displayedNetworks.map((network) => credentialByNetwork.get(network)).join('\n'))

  const firstRow = page.getByRole('row').filter({ hasText: '203.0.113.0/24' })
  await firstRow.getByRole('button', { name: '查看 美国 的 IP 账密' }).click()
  let verificationDialog = page.getByRole('dialog', { name: '验证 IP 与账密' })
  await expect(verificationDialog.getByLabel('203.0.113.0/24 验证 IP 与账密')).toHaveValue(
    '203.0.113.25:6728:first-user:first-pass',
  )
  await verificationDialog.getByRole('button', { name: '取消' }).click()

  const secondRow = page.getByRole('row').filter({ hasText: '198.51.100.0/24' })
  await secondRow.getByRole('button', { name: '查看 美国 的 IP 账密' }).click()
  verificationDialog = page.getByRole('dialog', { name: '验证 IP 与账密' })
  await expect(verificationDialog.getByLabel('198.51.100.0/24 验证 IP 与账密')).toHaveValue(
    '198.51.100.42:7311:second-user:second-pass',
  )
  await verificationDialog.getByRole('button', { name: '取消' }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '批量复制 IP', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '批量复制 IP 账密', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeVisible()
  await credentialImportButton.click()
  const mobileDialog = page.getByRole('dialog', { name: '整表导入 IP 账密 · INS' })
  const dialogBox = await mobileDialog.boundingBox()
  expect(dialogBox?.x).toBeGreaterThanOrEqual(0)
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(390)
})

async function readClipboard(page: import('@playwright/test').Page): Promise<string> {
  return (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
}
