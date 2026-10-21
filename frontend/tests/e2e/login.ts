import { expect, type Page } from '@playwright/test'

export const TEST_PASSWORD = 'test-only-password'

// Full restore intentionally clears only an explicitly opted-in isolated test backend.
export async function resetTestData(page: Page) {
  if (process.env.E2E_ISOLATED !== '1' || process.env.BACKEND_URL !== 'http://127.0.0.1:18080') {
    throw new Error(
      'E2E requires E2E_ISOLATED=1 and a disposable backend on http://127.0.0.1:18080. Never point this suite at real data.',
    )
  }
  const request = page.request
  const token = await (await request.get('/api/v1/auth/csrf')).json()
  const login = await request.post('/api/v1/auth/login', {
    form: { username: 'test-admin', password: TEST_PASSWORD },
    headers: { [token.headerName]: token.token },
  })
  expect(login.ok()).toBeTruthy()
  const csrf = await (await request.get('/api/v1/auth/csrf')).json()
  const backup = {
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
  const restore = await request.post('/api/v1/backups/restore', {
    headers: { [csrf.headerName]: csrf.token },
    multipart: {
      file: {
        name: 'empty-test-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup)),
      },
      operationId: crypto.randomUUID(),
      confirmation: 'REPLACE_ALL_PLATFORMS',
    },
  })
  expect(restore.ok(), await restore.text()).toBeTruthy()
  await request.post('/api/v1/auth/logout', { headers: { [csrf.headerName]: csrf.token } })
}

export async function loginAsAdmin(page: Page) {
  await resetTestData(page)
  await page.goto('/ins/accounts')
  await page.getByLabel('账号').fill('test-admin')
  await page.getByLabel('密码').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: 'INS · 账号管理' })).toBeVisible()
}
