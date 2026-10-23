import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('refreshing a detail preserves its content while the request is pending', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'aa11bb22cc33', exact: true }).click()
  await expect(page.getByRole('heading', { name: '会话详情', exact: true })).toBeVisible()
  await expect(page.locator('code').filter({ hasText: 'aa11bb22cc33' })).toBeVisible()
  await page.route('**/api/session/aa11bb22cc33', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    await route.continue()
  })
  await page.getByRole('button', { name: '刷新状态', exact: true }).click()
  await page.waitForTimeout(100)
  expect(await page.locator('code').filter({ hasText: 'aa11bb22cc33' }).count()).toBe(1)
})

test('navigation keeps the current view visible until the destination data is ready', async ({
  page,
}) => {
  await login(page)
  await page.route('**/api/users', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700))
    await route.continue()
  })
  await page.getByRole('link', { name: '用户管理', exact: true }).click()
  await page.waitForTimeout(100)
  expect(await page.getByRole('heading', { name: '远程会话', exact: true }).count()).toBe(1)
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible()
})

test('view and filter changes run a short transition; compact rows retain readable controls', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__transitionCount = 0
    window.__motionDurations = []
    const start = document.startViewTransition.bind(document)
    document.startViewTransition = (...args) => {
      window.__transitionCount += 1
      const result = start(...args)
      result.ready
        .then(() => {
          window.__motionDurations = document
            .getAnimations()
            .map((animation) => animation.effect?.getComputedTiming().duration)
        })
        .catch(() => {})
      return result
    }
  })
  await login(page)
  await page.getByRole('link', { name: 'aa11bb22cc33', exact: true }).waitFor()
  const before = await page.evaluate(() => window.__transitionCount)
  await page.getByRole('tab', { name: '已连接', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__transitionCount)).toBeGreaterThan(before)
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__motionDurations.some((duration) => duration > 0 && duration <= 200),
      ),
    )
    .toBeTruthy()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'aa11bb22cc33', exact: true }) })
  expect((await row.boundingBox()).height).toBeLessThanOrEqual(52)
})

test('reduced motion skips transitions and navigation still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    window.__transitionCount = 0
    const start = document.startViewTransition.bind(document)
    document.startViewTransition = (...args) => {
      window.__transitionCount += 1
      return start(...args)
    }
  })
  await login(page)
  await page.getByRole('link', { name: '用户管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__transitionCount)).toBe(0)
})
