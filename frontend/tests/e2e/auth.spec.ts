import { expect, test } from '@playwright/test'
import { resetTestData, TEST_PASSWORD } from './login'

test.beforeEach(async ({ page }) => {
  await resetTestData(page)
})

test('requires a valid server account before entering the application', async ({ page }) => {
  await page.goto('/ins/accounts')

  await expect(page.getByRole('heading', { name: '登录 Appeal Manager' })).toBeVisible()
  await page.getByLabel('账号').fill('admin-test')
  await page.getByLabel('密码').fill('wrong-password')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByText(/用户名或密码错误/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'INS · 账号管理' })).toHaveCount(0)
})

test('gives the administrator all actions and keeps the read-only account view-only', async ({
  page,
}) => {
  await login(page, 'test-admin', TEST_PASSWORD)
  await expect(page.getByText('管理员')).toBeVisible()
  await expect(page.getByRole('button', { name: '增加一行账号' })).toBeVisible()

  await page.getByRole('button', { name: '退出' }).click()
  await login(page, 'test-reader', TEST_PASSWORD)

  await expect(page.getByText('只读账号')).toBeVisible()
  await expect(page.getByText('当前为只读模式')).toBeVisible()
  await expect(page.getByRole('button', { name: '增加一行账号' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '批量导入' })).toHaveCount(0)

  await page.goto('/ins/appeal-flow')
  await expect(page.getByRole('heading', { name: 'INS · 申诉流程' })).toBeVisible()
  await expect(page.getByRole('button', { name: /增加一个模块|创建模块/ })).toHaveCount(0)

  await page.goto('/ins/appeal-records')
  await expect(page.getByRole('heading', { name: 'INS · 申诉记录' })).toBeVisible()
  await expect(page.getByRole('button', { name: /增加一行记录|创建申诉记录/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '快速导入' })).toHaveCount(0)

  await page.goto('/ins/backup')
  await expect(page.getByRole('heading', { name: '服务器备份与恢复' })).toBeVisible()
  await expect(page.getByRole('button', { name: '下载备份文件' })).toBeVisible()
  await expect(page.getByText('只读账号不能恢复备份')).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
})

async function login(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/ins/accounts')
  await page.getByLabel('账号').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: 'INS · 账号管理' })).toBeVisible()
}
