import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './login'

test('failed writes are not silently saved and retain the editor', async ({ page }) => {
  await loginAsAdmin(page)
  await page.getByRole('button', { name: '增加一行账号' }).click()
  const dialog = page.getByRole('dialog', { name: '新增账号' })
  for (const [i, value] of ['美国', 'unsaved', 'p', 'a@example.test', 'e', '2fa'].entries())
    await dialog.locator('input').nth(i).fill(value)
  let writes = 0
  await page.route('**/api/v1/platforms/ins/accounts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    writes++
    await route.abort('connectionfailed')
  })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText(/结果可能尚未确认/)).toBeVisible()
  await expect(dialog).toBeVisible()
  expect(writes).toBe(1)
  const list = await (await page.request.get('/api/v1/platforms/ins/accounts')).json()
  expect(list.total).toBe(0)
})

test('session expiry asks for login and maintenance has a retryable error state', async ({
  page,
}) => {
  await loginAsAdmin(page)
  await page.route('**/api/v1/platforms/ins/accounts?*', (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: 'MAINTENANCE',
        message: '正在恢复共享数据，请稍后重试',
        requestId: 'test-maintenance',
      },
    }),
  )
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText(/正在恢复共享数据/)).toBeVisible()
  await page.unroute('**/api/v1/platforms/ins/accounts?*')
  await page.route('**/api/v1/platforms/ins/accounts?*', (route) =>
    route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED', message: '请先登录' } }),
  )
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('heading', { name: '登录 Appeal Manager' })).toBeVisible()
})

test('a late IP completion response cannot replace a different filtered row', async ({ page }) => {
  await loginAsAdmin(page)
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json()
  await page.request.post('/api/v1/platforms/ins/appeal-records/quick-import', {
    data: { country: '美国', text: '203.0.113.0/24\n198.51.100.0/24', groupSize: 1 },
    headers: { [csrf.headerName]: csrf.token },
  })
  await page.goto('/ins/appeal-records')
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(rows).toHaveCount(2)
  const networks = await rows.locator('.ip-item span').allTextContents()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/ips/*/completed', async (route) => {
    const response = await route.fetch()
    await gate
    await route.fulfill({ response })
  })
  await rows
    .first()
    .getByRole('checkbox', { name: /标记 IP/ })
    .check()
  await page.getByPlaceholder('搜索账号、国家、IP 或申诉平台').fill(networks[1]!)
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText(networks[1]!)
  release()
  await expect(page.getByRole('checkbox', { name: `标记 IP ${networks[1]} 为完成` })).toBeEnabled()
  await expect(rows).toContainText(networks[1]!)
  await expect(rows).not.toContainText(networks[0]!)
})

test('a lost restore response is resolved through its receipt without a second restore', async ({
  page,
}) => {
  await loginAsAdmin(page)
  await page.goto('/ins/backup')
  const fixture = {
    format: 'platform-appeal-manager-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      accounts: [],
      appealModules: [],
      appealSteps: [],
      appealRecords: [],
      evidenceImages: [],
    },
  }
  await page.locator('input[type="file"]').setInputFiles({
    name: 'empty-recovery-test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  })
  await expect(page.getByText('empty-recovery-test.json', { exact: true })).toBeVisible()
  let restores = 0
  await page.route('**/api/v1/backups/restore', async (route) => {
    restores++
    const response = await route.fetch()
    expect(response.ok()).toBeTruthy()
    await route.abort('connectionfailed')
  })
  await page.getByRole('button', { name: '替换并恢复', exact: true }).click()
  await expect(page.locator('input[type="file"]')).toBeDisabled()
  await page
    .getByRole('dialog', { name: '确认恢复备份' })
    .getByRole('button', { name: '替换并恢复' })
    .click()
  await expect(page.getByRole('button', { name: '查询恢复结果' })).toBeVisible()
  await page.getByRole('button', { name: '查询恢复结果' }).click()
  await expect(page.getByText('服务器已确认恢复成功')).toBeVisible()
  await expect(page.locator('input[type="file"]')).toBeEnabled()
  expect(restores).toBe(1)
})
