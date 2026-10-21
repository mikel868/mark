import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

test('uploads and persists verification evidence images for one appeal record', async ({
  page,
}) => {
  await loginAsAdmin(page)
  const onePixelPng = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvas.getContext('2d')!.fillRect(0, 0, 2, 2)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
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
    .fill('203.0.113.0/24')
  await importDialog.getByRole('button', { name: '确认生成 1 条记录' }).click()

  await page.getByRole('button', { name: '管理 美国 的验证证据图片' }).click()
  const evidenceDialog = page.getByRole('dialog', { name: '验证证据图片 · 美国' })
  await evidenceDialog.locator('input[type="file"]').setInputFiles({
    name: 'verification-proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from(onePixelPng, 'base64'),
  })

  await expect(evidenceDialog.getByText('verification-proof.png', { exact: true })).toBeVisible()
  await expect(evidenceDialog.getByRole('img', { name: 'verification-proof.png' })).toBeVisible()
  await evidenceDialog.getByRole('button', { name: '关闭', exact: true }).click()

  await page.reload()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '管理 美国 的验证证据图片' }).click()
  const restoredDialog = page.getByRole('dialog', { name: '验证证据图片 · 美国' })
  await expect(restoredDialog.getByText('verification-proof.png', { exact: true })).toBeVisible()
  const dialogBox = await restoredDialog.boundingBox()
  expect(dialogBox?.x).toBeGreaterThanOrEqual(0)
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(390)

  await restoredDialog.getByRole('button', { name: '删除证据图片 verification-proof.png' }).click()
  await page
    .getByRole('dialog', { name: '删除证据图片' })
    .getByRole('button', { name: '删除', exact: true })
    .click()
  await expect(restoredDialog.getByText('还没有验证证据图片')).toBeVisible()
})
