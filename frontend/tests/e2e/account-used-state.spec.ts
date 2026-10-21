import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('marks an account as used, persists it and filters by usage state', async ({ page }) => {
  await loginAsAdmin(page)
  await page.getByRole('button', { name: '增加一行账号' }).click()

  const dialog = page.getByRole('dialog', { name: '新增账号' })
  const inputs = dialog.locator('input')
  await inputs.nth(0).fill('美国')
  await inputs.nth(1).fill('used-state-account')
  await inputs.nth(2).fill('account-password')
  await inputs.nth(3).fill('used-state@example.com')
  await inputs.nth(4).fill('email-password')
  await inputs.nth(5).fill('USEDSTATE2FA')
  await dialog.getByRole('button', { name: '保存' }).click()

  const accountRow = page.locator('.el-table__body-wrapper tbody tr').filter({
    hasText: 'used-state-account',
  })
  const checkbox = accountRow.getByRole('checkbox', { name: '已失效' })
  await expect(checkbox).not.toBeChecked()
  await checkbox.locator('xpath=ancestor::label').click()
  await expect(checkbox).toBeChecked()

  await accountRow.getByRole('button', { name: '编辑' }).click()
  const editDialog = page.getByRole('dialog', { name: '编辑账号' })
  await editDialog.locator('textarea').fill('普通编辑不能重置已使用状态')
  await editDialog.getByRole('button', { name: '保存' }).click()
  await expect(accountRow.getByRole('checkbox', { name: '已失效' })).toBeChecked()

  await page.reload()
  await expect(accountRow.getByRole('checkbox', { name: '已失效' })).toBeChecked()

  const usageFilter = page.getByRole('combobox', { name: '按使用状态筛选' })
  const usageSelect = usageFilter.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " el-select ")]',
  )
  await usageSelect.click()
  await page.getByRole('option', { name: '未使用' }).click()
  await expect(page.getByText('used-state-account', { exact: true })).toHaveCount(0)

  await usageSelect.click()
  await page.getByRole('option', { name: '已失效' }).click()
  await expect(page.getByText('used-state-account', { exact: true })).toBeVisible()
})

test('selects accounts for batch copy without changing their used state', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })
  await loginAsAdmin(page)
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const dialog = page.getByRole('dialog', { name: '批量导入账号 · INS' })
  await dialog.locator('textarea').fill(`|国家|账号|密码|邮箱账号|邮箱密码|2fa|
|---|---|---|---|---|---|
|美国|batch-copy-account-one|password-one|one@example.test|mail-one|ONE2FA|
|日本|batch-copy-account-two|password-two|two@example.test|mail-two|TWO2FA|`)
  await dialog.getByRole('button', { name: '确认导入 2 行' }).click()

  const firstRow = page.getByRole('row').filter({ hasText: 'batch-copy-account-one' })
  const secondRow = page.getByRole('row').filter({ hasText: 'batch-copy-account-two' })

  await expect(firstRow.getByRole('checkbox')).toHaveCount(2)
  await expect(firstRow.getByRole('checkbox', { name: '已失效' })).not.toBeChecked()
  await firstRow.locator('td').first().locator('.el-checkbox').click()
  await secondRow.locator('td').first().locator('.el-checkbox').click()

  await expect(page.getByText('已选择 2 个账号')).toBeVisible()
  await expect(firstRow.getByRole('checkbox', { name: '已失效' })).not.toBeChecked()
  await page.getByRole('button', { name: '批量复制账号', exact: true }).click()
  await expect
    .poll(() => readClipboard(page))
    .toBe('batch-copy-account-one\nbatch-copy-account-two')

  await page.setViewportSize({ width: 390, height: 844 })
  const selectionActions = page.locator('.selection-actions')
  await expect(selectionActions.getByRole('button', { name: '批量复制账号' })).toBeVisible()
  const selectionActionsBox = await selectionActions.boundingBox()
  expect(selectionActionsBox?.x).toBeGreaterThanOrEqual(0)
  expect((selectionActionsBox?.x ?? 0) + (selectionActionsBox?.width ?? 0)).toBeLessThanOrEqual(390)
})

async function readClipboard(page: import('@playwright/test').Page): Promise<string> {
  return (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
}
