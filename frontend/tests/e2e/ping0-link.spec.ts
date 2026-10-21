import { expect, test } from '@playwright/test'

import { loginAsAdmin } from './login'

const PING0_URL = 'https://ping0.cc/'

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })
  await loginAsAdmin(page)
})

test('shows and copies the Ping0 URL only in the Ping0 module', async ({ page }) => {
  await page.goto('/ping0/accounts')

  const websiteCard = page.getByRole('region', { name: 'Ping0 网址' })
  await expect(websiteCard).toContainText(PING0_URL)
  await expect(websiteCard.getByRole('link', { name: '打开网址' })).toHaveAttribute(
    'href',
    PING0_URL,
  )
  await websiteCard.getByRole('button', { name: '复制Ping0 网址' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(PING0_URL)

  await page.setViewportSize({ width: 390, height: 844 })
  const cardBox = await websiteCard.boundingBox()
  expect(cardBox?.x).toBeGreaterThanOrEqual(0)
  expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(390)

  await page.goto('/ins/accounts')
  await expect(page.getByRole('region', { name: 'Ping0 网址' })).toHaveCount(0)
})
