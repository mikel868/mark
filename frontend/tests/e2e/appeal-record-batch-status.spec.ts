import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('changes the status of all selected appeal records', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '快速导入', exact: true }).first().click()

  const importDialog = page.getByRole('dialog', { name: '快速导入申诉记录 · INS' })
  await importDialog
    .locator('.el-form-item')
    .filter({ hasText: '国家' })
    .locator('input')
    .fill('美国')
  await importDialog.getByRole('spinbutton').fill('1')
  await importDialog
    .locator('.el-form-item')
    .filter({ hasText: '网段列表' })
    .locator('textarea')
    .fill('203.0.113.0/24\n198.51.100.0/24')
  await importDialog.getByRole('button', { name: '确认生成 2 条记录' }).click()

  const recordRows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(recordRows).toHaveCount(2)
  await recordRows.nth(0).locator('td').first().locator('.el-checkbox').click()
  await recordRows.nth(1).locator('td').first().locator('.el-checkbox').click()

  await page.setViewportSize({ width: 390, height: 844 })
  const selectionActions = page.locator('.selection-actions')
  const selectionBox = await selectionActions.boundingBox()
  expect(selectionBox?.x).toBeGreaterThanOrEqual(0)
  expect((selectionBox?.x ?? 0) + (selectionBox?.width ?? 0)).toBeLessThanOrEqual(390)

  const batchStatus = page.getByRole('combobox', { name: '批量状态' })
  const updateButton = page.getByRole('button', { name: '批量修改状态', exact: true })
  await expect(updateButton).toBeDisabled()
  await expect(batchStatus).toBeVisible()
  await batchStatus.press('ArrowDown')
  await page.getByRole('option', { name: '审核中' }).click()
  await expect(updateButton).toBeEnabled()
  await updateButton.click()

  await expect(page.getByText('已将 2 条申诉记录修改为“审核中”')).toBeVisible()
  await expect(page.getByText('已选择 2 条申诉记录')).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '审核中' })).toHaveCount(2)
})
