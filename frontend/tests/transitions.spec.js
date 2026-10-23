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

test('navigation switches immediately and refreshes cached sessions in the background', async ({
  page,
}) => {
  await login(page)
  await page.getByRole('link', { name: 'aa11bb22cc33', exact: true }).waitFor()
  await page.getByRole('link', { name: '用户管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重绑 TOTP' }).first().waitFor()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await page.route('**/api/sessions', async (route) => {
    await gate
    await route.continue()
  })
  try {
    const request = page.waitForRequest('**/api/sessions')
    await page.getByRole('link', { name: '远程会话', exact: true }).click()
    await request
    await expect(page.getByRole('heading', { name: '远程会话', exact: true })).toBeVisible({
      timeout: 1000,
    })
    await expect(page).toHaveURL(/\/connect\/$/)
    await expect(page.getByRole('link', { name: 'aa11bb22cc33', exact: true })).toBeVisible()
    await expect(page.getByRole('status', { name: '正在加载页面数据' })).toBeVisible()
  } finally {
    release()
  }
  await expect(page.getByRole('status', { name: '正在加载页面数据' })).toHaveCount(0)
})

test('first visit shows a skeleton and an abandoned request cannot show an error on another page', async ({
  page,
}) => {
  await login(page)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await page.route('**/api/users', async (route) => {
    await gate
    await route.fulfill({
      status: 502,
      json: { error: { code: 'broker_failed', message: 'abandoned-users-request' } },
    })
  })
  try {
    const request = page.waitForRequest('**/api/users')
    await page.getByRole('link', { name: '用户管理', exact: true }).click()
    await request
    await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible({
      timeout: 1000,
    })
    await expect(page.getByRole('status', { name: '正在加载用户', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '远程会话', exact: true }).click()
    await expect(page.getByRole('heading', { name: '远程会话', exact: true })).toBeVisible({
      timeout: 1000,
    })
    const response = page.waitForResponse('**/api/users')
    release()
    await response
    await page.waitForTimeout(100)
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    release()
  }
})

test('late detail data cannot overwrite the newly selected session', async ({ page }) => {
  await login(page)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await page.route('**/api/session/aa11bb22cc33', async (route) => {
    await gate
    await route.continue()
  })
  try {
    const request = page.waitForRequest('**/api/session/aa11bb22cc33')
    await page.getByRole('link', { name: 'aa11bb22cc33', exact: true }).click()
    await request
    await expect(page.getByRole('heading', { name: '会话详情', exact: true })).toBeVisible({
      timeout: 1000,
    })
    await expect(page.getByRole('status', { name: '正在加载会话详情', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '远程会话', exact: true }).click()
    await page.getByRole('link', { name: 'fedcba543210', exact: true }).click()
    await expect(page.getByRole('heading', { name: '会话详情', exact: true })).toBeVisible()
    await expect(page.locator('code').filter({ hasText: 'fedcba543210' })).toBeVisible()
    const response = page.waitForResponse('**/api/session/aa11bb22cc33')
    release()
    await response
    await page.waitForTimeout(100)
    await expect(page.locator('code').filter({ hasText: 'fedcba543210' })).toBeVisible()
    await expect(page.locator('code').filter({ hasText: 'aa11bb22cc33' })).toHaveCount(0)
  } finally {
    release()
  }
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
