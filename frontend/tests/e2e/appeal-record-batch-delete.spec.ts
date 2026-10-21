import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('deletes selected appeal records after confirmation', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '快速导入', exact: true }).click()

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
    .fill('203.0.113.0/24\n198.51.100.0/24\n192.0.2.0/24')
  await importDialog.getByRole('button', { name: '确认生成 3 条记录' }).click()

  const recordRows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(recordRows).toHaveCount(3)
  await recordRows.nth(0).locator('td').first().locator('.el-checkbox').click()
  await recordRows.nth(1).locator('td').first().locator('.el-checkbox').click()

  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  const confirmDialog = page.getByRole('dialog', { name: '批量删除申诉记录' })
  await expect(confirmDialog).toContainText('确定删除选中的 2 条申诉记录吗')
  await confirmDialog.getByRole('button', { name: '取消' }).click()
  await expect(recordRows).toHaveCount(3)

  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await page
    .getByRole('dialog', { name: '批量删除申诉记录' })
    .getByRole('button', { name: '删除 2 条' })
    .click()

  await expect(page.getByText('已删除 2 条申诉记录')).toBeVisible()
  await expect(recordRows).toHaveCount(1)
  await expect(page.getByText('已选择 2 条申诉记录')).toHaveCount(0)
})
