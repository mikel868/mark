import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

const TIKTOK_FEEDBACK_URL = 'https://www.tiktok.com/legal/report/feedback'

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })
  await loginAsAdmin(page)
})

test('shows and copies the TikTok feedback URL only in the TikTok module', async ({ page }) => {
  await page.goto('/tiktok/accounts')

  const feedbackCard = page.getByRole('region', { name: 'TikTok 反馈申诉网址' })
  await expect(feedbackCard).toContainText(TIKTOK_FEEDBACK_URL)
  await feedbackCard.getByRole('button', { name: '复制TikTok 反馈申诉网址' }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(TIKTOK_FEEDBACK_URL)

  await page.setViewportSize({ width: 390, height: 844 })
  const cardBox = await feedbackCard.boundingBox()
  expect(cardBox?.x).toBeGreaterThanOrEqual(0)
  expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(390)

  await page.goto('/ins/accounts')
  await expect(page.getByRole('region', { name: 'TikTok 反馈申诉网址' })).toHaveCount(0)
})
