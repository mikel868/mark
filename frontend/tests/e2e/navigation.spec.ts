import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

test('shares navigation across all four platforms', async ({ page }) => {
  await page.goto('/ins/accounts')
  await expect(page.getByRole('heading', { name: 'INS · 账号管理' })).toBeVisible()

  await page.getByRole('button', { name: /Ping0/ }).click()
  await expect(page).toHaveURL(/\/ping0\/accounts$/)
  await expect(page.getByRole('heading', { name: 'Ping0 · 账号管理' })).toBeVisible()

  await page.getByRole('button', { name: /申诉流程/ }).click()
  await expect(page.getByRole('heading', { name: 'Ping0 · 申诉流程' })).toBeVisible()
})

test('shows validation instead of crashing for an empty appeal time', async ({ page }) => {
  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('.el-form-item').filter({ hasText: '国家' }).locator('input').fill('美国')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: 'IP' })
    .locator('textarea')
    .fill('1.1.1.1')
  await dialog.locator('input[type="datetime-local"]').fill('')
  await dialog.getByRole('button', { name: '保存' }).click()

  await expect(page.getByText('申诉时间不能为空')).toBeVisible()
  await expect(dialog).toBeVisible()
})

test('stores and displays one appeal IP address or CIDR per line', async ({ page }) => {
  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('.el-form-item').filter({ hasText: '国家' }).locator('input').fill('美国')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: 'IP 地址' })
    .locator('textarea')
    .fill(' 1.1.1.1 \n\n194.179.156.0/24 \n2001:db8::/32 ')
  await dialog.getByRole('button', { name: '保存' }).click()

  const ipList = page.locator('.ip-list')
  await expect(ipList.locator('.ip-item span')).toHaveText([
    '1.1.1.1',
    '194.179.156.0/24',
    '2001:db8::/32',
  ])

  const recordRow = page.getByRole('row').filter({ has: ipList })
  await recordRow.getByRole('button', { name: '编辑' }).click()
  await expect(page.getByRole('dialog').locator('textarea').first()).toHaveValue(
    '1.1.1.1\n194.179.156.0/24\n2001:db8::/32',
  )
})

test('quick imports network ranges using an entered group size', async ({ page }) => {
  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '快速导入' }).click()

  const dialog = page.getByRole('dialog', { name: '快速导入申诉记录 · INS' })
  await dialog.locator('.el-form-item').filter({ hasText: '国家' }).locator('input').fill('美国')
  const groupSizeInput = dialog
    .locator('.el-form-item')
    .filter({ hasText: '每条记录包含' })
    .locator('input')
  await expect(groupSizeInput).toHaveValue('5')
  await groupSizeInput.fill('')
  await expect(dialog.getByText('请输入每条记录包含的网段数量')).toBeVisible()
  await groupSizeInput.fill('4')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '网段列表' })
    .locator('textarea')
    .fill(
      ['209.166.41', '205.179.217', '69.3.140', '72.245.153', '155.229.74', '216.254.7'].join('\n'),
    )

  await expect(dialog.getByText('共 6 个网段')).toBeVisible()
  await expect(dialog.getByText('将生成 2 条记录')).toBeVisible()
  await expect(dialog.getByText('4/4')).toBeVisible()
  await expect(dialog.getByText('2/4')).toBeVisible()
  await dialog.getByRole('button', { name: '确认生成 2 条记录' }).click()

  const recordRows = page.locator('.records-panel .el-table__body tr')
  const firstGroup = recordRows.filter({ hasText: '209.166.41.0/24' })
  const secondGroup = recordRows.filter({ hasText: '216.254.7.0/24' })
  await expect(firstGroup.locator('.ip-item')).toHaveCount(4)
  await expect(firstGroup).toContainText('72.245.153.0/24')
  await expect(firstGroup).not.toContainText('155.229.74.0/24')
  await expect(firstGroup).not.toContainText('216.254.7.0/24')
  await expect(secondGroup.locator('.ip-item')).toHaveCount(2)
  await expect(secondGroup).toContainText('155.229.74.0/24')
  await expect(recordRows).toHaveCount(2)

  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: '209.166.41.0/24' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '216.254.7.0/24' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '快速导入' }).click()
  await expect(dialog).toBeVisible()
  const dialogBox = await dialog.boundingBox()
  expect(dialogBox?.x).toBeGreaterThanOrEqual(0)
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(390)
})

test('marks individual IPs complete and persists only the checked IP highlight', async ({
  page,
}) => {
  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('.el-form-item').filter({ hasText: '国家' }).locator('input').fill('美国')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: 'IP 地址' })
    .locator('textarea')
    .fill('203.0.113.25\n203.0.113.26')
  await dialog.getByRole('button', { name: '保存' }).click()

  let recordRow = page.getByRole('row').filter({ hasText: '203.0.113.25' })
  let firstIp = recordRow.locator('.ip-item').filter({ hasText: '203.0.113.25' })
  let secondIp = recordRow.locator('.ip-item').filter({ hasText: '203.0.113.26' })

  await expect(recordRow.getByRole('checkbox', { name: /标记 IP .* 为完成/ })).toHaveCount(2)
  await recordRow.getByRole('checkbox', { name: '标记 IP 203.0.113.25 为完成' }).check()
  await expect(recordRow.getByText('部分完成', { exact: true })).toBeVisible()
  await expect(firstIp).toHaveClass(/is-completed/)
  await expect(firstIp).toHaveCSS('background-color', 'rgb(232, 247, 239)')
  await expect(secondIp).not.toHaveClass(/is-completed/)
  await expect(secondIp).not.toHaveCSS('background-color', 'rgb(232, 247, 239)')

  await page.reload()
  recordRow = page.getByRole('row').filter({ hasText: '203.0.113.25' })
  firstIp = recordRow.locator('.ip-item').filter({ hasText: '203.0.113.25' })
  secondIp = recordRow.locator('.ip-item').filter({ hasText: '203.0.113.26' })

  await expect(recordRow.getByText('部分完成', { exact: true })).toBeVisible()
  await expect(
    recordRow.getByRole('checkbox', { name: '标记 IP 203.0.113.25 为完成' }),
  ).toBeChecked()
  await expect(firstIp).toHaveClass(/is-completed/)
  await expect(secondIp).not.toHaveClass(/is-completed/)

  await recordRow.getByRole('checkbox', { name: '标记 IP 203.0.113.25 为完成' }).uncheck()
  await expect(recordRow.getByText('准备中', { exact: true })).toBeVisible()
  await expect(firstIp).not.toHaveClass(/is-completed/)
})

test('edits one verification IP credential per record network and persists partial data', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })
  await page.goto('/ins/appeal-records')
  await page.getByRole('button', { name: '增加一行记录' }).click()

  let recordDialog = page.getByRole('dialog', { name: '新增申诉记录' })
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: '国家' })
    .locator('input')
    .fill('美国')
  await recordDialog
    .locator('.el-form-item')
    .filter({ hasText: 'IP 地址' })
    .locator('textarea')
    .fill('203.0.113.0/24\n198.51.100.0/24')
  await expect(recordDialog.getByText('申诉模块', { exact: true })).toHaveCount(0)
  await expect(recordDialog.getByText('当前步骤', { exact: true })).toHaveCount(0)
  await expect(recordDialog.getByText('验证 IP', { exact: true })).toHaveCount(0)
  await recordDialog.getByRole('button', { name: '保存' }).click()

  await expect(page.getByRole('columnheader', { name: '当前流程' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: '快捷操作' })).toBeVisible()

  const recordRow = page.getByRole('row').filter({ hasText: '203.0.113.0/24' })
  let verificationButton = recordRow.getByRole('button', {
    name: '查看 美国 的 IP 账密',
  })
  await expect(verificationButton).toHaveCount(1)
  await expect(verificationButton).toHaveText('查看 IP 账密')
  await expect(recordRow.getByRole('button', { name: /复制.*验证 IP/ })).toHaveCount(0)
  await verificationButton.click()

  let verificationDialog = page.getByRole('dialog', { name: '验证 IP 与账密' })
  await expect(verificationDialog.getByText('203.0.113.0/24', { exact: true })).toBeVisible()
  await expect(verificationDialog.getByText('198.51.100.0/24', { exact: true })).toBeVisible()
  await expect(verificationDialog.locator('textarea')).toHaveCount(2)
  await expect(verificationDialog.getByLabel('203.0.113.0/24 账号')).toHaveCount(0)
  await expect(verificationDialog.getByRole('button', { name: '一键复制' })).toBeDisabled()
  await verificationDialog.getByRole('button', { name: '快速导入' }).click()
  await verificationDialog
    .getByLabel('快速导入验证 IP 与账密')
    .fill(
      '203.0.113.25:6728:proxy-user:proxy-pass\\\n198.51.100.42:7311:proxy-user-2:proxy-pass-2\\',
    )
  await verificationDialog.getByRole('button', { name: '对比 IP 并填入' }).click()
  await expect(verificationDialog.getByText('已匹配并填入 2 条')).toBeVisible()
  await expect(verificationDialog.getByLabel('203.0.113.0/24 验证 IP 与账密')).toHaveValue(
    '203.0.113.25:6728:proxy-user:proxy-pass',
  )
  await expect(verificationDialog.getByLabel('198.51.100.0/24 验证 IP 与账密')).toHaveValue(
    '198.51.100.42:7311:proxy-user-2:proxy-pass-2',
  )
  await verificationDialog.getByRole('button', { name: '保存验证 IP' }).click()

  await expect(verificationButton).toHaveText('查看 IP 账密')
  await verificationButton.click()
  verificationDialog = page.getByRole('dialog', { name: '验证 IP 与账密' })
  await verificationDialog.getByRole('button', { name: '一键复制' }).click()
  const copiedVerificationIps = (await page.evaluate(() => navigator.clipboard.readText())).replace(
    /\r\n/g,
    '\n',
  )
  expect(copiedVerificationIps).toBe(
    '203.0.113.25:6728:proxy-user:proxy-pass\n198.51.100.42:7311:proxy-user-2:proxy-pass-2',
  )
  await verificationDialog.getByRole('button', { name: '取消' }).click()

  await page.reload()
  verificationButton = page.getByRole('button', {
    name: '查看 美国 的 IP 账密',
  })
  await expect(verificationButton).toHaveText('查看 IP 账密')
  await verificationButton.click()
  verificationDialog = page.getByRole('dialog', { name: '验证 IP 与账密' })
  await expect(verificationDialog.getByLabel('203.0.113.0/24 验证 IP 与账密')).toHaveValue(
    '203.0.113.25:6728:proxy-user:proxy-pass',
  )

  await verificationDialog
    .getByLabel('203.0.113.0/24 验证 IP 与账密')
    .fill('203.0.114.1:6728:proxy-user:proxy-pass')
  await verificationDialog.getByRole('button', { name: '保存验证 IP' }).click()
  await expect(page.getByText('验证 IP 不属于网段 203.0.113.0/24')).toBeVisible()
  await verificationDialog.getByRole('button', { name: '取消' }).click()

  await recordRow.getByRole('button', { name: '编辑' }).click()
  recordDialog = page.getByRole('dialog', { name: '编辑申诉记录' })
  await expect(recordDialog.getByText('申诉模块', { exact: true })).toHaveCount(0)
  await expect(recordDialog.getByText('当前步骤', { exact: true })).toHaveCount(0)
  await expect(recordDialog.getByText('验证 IP', { exact: true })).toHaveCount(0)
  await expect(recordDialog.getByRole('button', { name: /验证 IP/ })).toHaveCount(0)
})
