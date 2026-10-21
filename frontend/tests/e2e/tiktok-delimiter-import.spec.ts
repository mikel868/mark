import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('imports the TikTok delimiter template including decode link and specific region', async ({
  page,
}) => {
  await loginAsAdmin(page)
  await page.goto('/tiktok/accounts')
  await page.getByRole('button', { name: '批量导入' }).first().click()

  const dialog = page.getByRole('dialog', { name: '批量导入账号 · TikTok' })
  await expect(dialog.locator('textarea')).toHaveAttribute(
    'placeholder',
    /账号 ---- 密码 ---- 邮箱 ---- 邮箱密码 ---- \[解码链接\]\(解码链接\) ---- 具体地区/,
  )
  await dialog
    .locator('textarea')
    .fill(
      'thai-import-user ---- Example913690** ---- thai-user@example.test ---- mail-pass ---- [http://decoder.example.test:8128/api/pickup?email=thai-user@example.test](http://decoder.example.test:8128/api/pickup?email=thai-user@example.test) ---- 泰国',
    )

  await expect(dialog.getByText('可导入 1 行')).toBeVisible()
  await expect(dialog.locator('.desktop-import-table .import-valid')).toContainText('字段完整')
  await dialog.getByRole('button', { name: '确认导入 1 行' }).click()

  const row = page.locator('.el-table__body-wrapper tbody tr').filter({
    hasText: 'thai-import-user',
  })
  await expect(row.getByText('thai-user@example.test', { exact: true })).toBeVisible()
  await expect(row.getByText('泰国', { exact: true })).toBeVisible()
  await expect(
    row.getByText('http://decoder.example.test:8128/api/pickup?email=thai-user@example.test', {
      exact: true,
    }),
  ).toBeVisible()
})
