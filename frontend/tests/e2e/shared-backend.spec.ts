import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin, TEST_PASSWORD } from './login'

async function write(page: Page, method: string, path: string, data: unknown) {
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json()
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: { [csrf.headerName]: csrf.token },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.status() === 204 ? undefined : response.json()
}

test('two browsers share server data, preserve foreign edits, enforce readonly and keep legacy storage untouched', async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page)
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('legacy-cutover-sentinel', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('data')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('data', 'readwrite')
        tx.objectStore('data').put('keep-me', 'original')
        tx.oncomplete = () => {
          open.result.close()
          resolve()
        }
      }
    })
  })
  const created = await write(page, 'POST', '/platforms/ins/accounts/import', {
    rows: [
      {
        country: '美国',
        account: 'shared-demo',
        password: 'p',
        emailAccount: 'shared@example.test',
        emailPassword: 'e',
        twoFactor: '2fa',
      },
    ],
  })
  const id = created.ids[0]
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: 'shared-demo' })
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑账号' })
  await dialog.getByRole('textbox', { name: '备注' }).fill('my note')
  // Another device changes a field after the editor was opened.
  await write(page, 'PATCH', `/platforms/ins/accounts/${id}/used`, { used: true })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(row.getByRole('checkbox', { name: '已失效', exact: true })).toBeChecked()

  const readerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    const reader = await readerContext.newPage()
    await reader.goto('/ins/accounts')
    await reader.getByLabel('账号', { exact: true }).fill('test-reader')
    await reader.getByLabel('密码', { exact: true }).fill(TEST_PASSWORD)
    await reader.getByRole('button', { name: '登录', exact: true }).click()
    await expect(reader.getByRole('cell', { name: 'shared-demo' })).toBeVisible()
    await expect(reader.getByRole('button', { name: '增加一行账号' })).toHaveCount(0)
    const csrf = await (await reader.request.get('/api/v1/auth/csrf')).json()
    const denied = await reader.request.patch(`/api/v1/platforms/ins/accounts/${id}/used`, {
      data: { used: false },
      headers: { [csrf.headerName]: csrf.token },
    })
    expect(denied.status()).toBe(403)
    const backup = await reader.request.get('/api/v1/backups/export')
    expect(backup.ok()).toBeTruthy()
    expect((await backup.json()).data.accounts).toHaveLength(1)
    await write(page, 'PATCH', `/platforms/ins/accounts/${id}`, { account: 'changed-on-server' })
    await expect(reader.getByRole('cell', { name: 'shared-demo' })).toBeVisible()
    await reader.getByRole('button', { name: '刷新', exact: true }).click()
    await expect(reader.getByRole('cell', { name: 'changed-on-server' })).toBeVisible()
  } finally {
    await readerContext.close()
  }
  await page.reload()
  expect(
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('legacy-cutover-sentinel')
          open.onsuccess = () => {
            const request = open.result.transaction('data').objectStore('data').get('original')
            request.onsuccess = () => {
              resolve(request.result)
              open.result.close()
            }
          }
        }),
    ),
  ).toBe('keep-me')
})

test('platform credential import and green export include records beyond the first page', async ({
  page,
}) => {
  await loginAsAdmin(page)
  await write(page, 'POST', '/platforms/ins/appeal-records/quick-import', {
    country: '美国',
    text: Array.from({ length: 11 }, (_, i) => `203.0.${i}.0/24`).join('\n'),
    groupSize: 1,
  })
  const all = await (
    await page.request.get('/api/v1/platforms/ins/appeal-records?pageSize=100')
  ).json()
  const last = all.items[10]
  await write(
    page,
    'PATCH',
    `/platforms/ins/appeal-records/${last.id}/ips/${last.ipItems[0].id}/completed`,
    { completed: true },
  )
  await page.goto('/ins/appeal-records')
  await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(10)
  await page.getByRole('button', { name: 'IP 账密导入', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '整表导入 IP 账密 · INS' })
  const host = last.ip.replace('.0/24', '.5')
  await dialog.getByLabel('整表 IP 账密快速导入').fill(`${host}:80:u:p`)
  await expect(dialog.getByText('已匹配 1 个网段')).toBeVisible()
  await dialog.getByRole('button', { name: '确认写入 1 条记录' }).click()
  await expect(dialog).toBeHidden()
  const saved = await (
    await page.request.get(`/api/v1/platforms/ins/appeal-records/${last.id}`)
  ).json()
  expect(saved.verificationIps[0].content).toBe(`${host}:80:u:p`)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出已勾选 IP' }).click()
  const stream = await (await download).createReadStream()
  const chunks = []
  for await (const chunk of stream!) chunks.push(chunk)
  expect(Buffer.concat(chunks).toString('utf8')).toContain(`美国\t${last.ip}`)
})

test('removing an IP requires confirmation before deleting its saved credential and mark', async ({
  page,
}) => {
  await loginAsAdmin(page)
  await write(page, 'POST', '/platforms/ins/appeal-records/quick-import', {
    country: '美国',
    text: '203.0.113.0/24\n198.51.100.0/24',
    groupSize: 2,
  })
  const list = await (await page.request.get('/api/v1/platforms/ins/appeal-records')).json()
  const record = list.items[0]
  await write(
    page,
    'PATCH',
    `/platforms/ins/appeal-records/${record.id}/ips/${record.ipItems[1].id}/completed`,
    { completed: true },
  )
  await write(page, 'PATCH', `/platforms/ins/appeal-records/${record.id}/verification-ips`, {
    edits: [{ ipId: record.ipItems[1].id, content: '198.51.100.5:80:test:fixture' }],
  })
  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑申诉记录' })
  await editor.getByRole('textbox', { name: 'IP 地址或网段（每行一个）' }).fill('203.0.113.0/24')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '确认移除 IP' })
  await expect(confirmation).toContainText('198.51.100.0/24')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  const unchanged = await (
    await page.request.get(`/api/v1/platforms/ins/appeal-records/${record.id}`)
  ).json()
  expect(unchanged.completedIps).toContain('198.51.100.0/24')
  expect(unchanged.verificationIps).toHaveLength(1)
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await confirmation.getByRole('button', { name: '移除并保存', exact: true }).click()
  await expect(editor).toBeHidden()
  const saved = await (
    await page.request.get(`/api/v1/platforms/ins/appeal-records/${record.id}`)
  ).json()
  expect(saved.ipItems).toHaveLength(1)
  expect(saved.completedIps).toEqual([])
  expect(saved.verificationIps).toEqual([])
})
