import { test, expect } from '@playwright/test'
import { login } from './helpers'

async function createSession(page) {
  await login(page)
  await page.getByRole('button', { name: '新建会话', exact: true }).click()
  await page.getByLabel('客户环境标识', { exact: true }).fill('independent-platform-test')
  await page.getByRole('button', { name: '创建会话', exact: true }).click()
  await expect(page.getByRole('heading', { name: '会话已创建' })).toBeVisible()
}

for (const first of ['受控机', '控制机']) {
  test(`switching ${first} leaves the other selector enabled and preserves both choices`, async ({
    page,
  }) => {
    await createSession(page)
    const other = first === '受控机' ? '控制机' : '受控机'
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const requests = []
    await page.route('**/api/session/*/platform', async (route) => {
      const form = new URLSearchParams(route.request().postData())
      requests.push(
        Object.fromEntries(
          ['current_platform', 'platform', 'operator_platform'].map((key) => [key, form.get(key)]),
        ),
      )
      if (requests.length === 1) await gate
      await route.continue()
    })
    try {
      const request = page.waitForRequest('**/api/session/*/platform')
      await page
        .getByRole('group', { name: `${first}操作系统`, exact: true })
        .getByRole('button', { name: 'Windows' })
        .click()
      await request
      const otherWindows = page
        .getByRole('group', { name: `${other}操作系统`, exact: true })
        .getByRole('button', { name: 'Windows' })
      await expect(otherWindows).toBeEnabled({ timeout: 1000 })
      await expect(
        page.getByRole('button', { name: `复制${other}命令`, exact: true }),
      ).toBeEnabled()
      await expect(
        page.getByRole('button', { name: '复制 AI 操作说明', exact: true }),
      ).toBeDisabled()
      await otherWindows.click()
      await expect(
        page.getByRole('status', { name: `正在切换${other}系统`, exact: true }),
      ).toBeVisible()
      expect(requests).toHaveLength(1)
      release()
      for (const label of ['受控机', '控制机']) {
        await expect(
          page
            .getByRole('group', { name: `${label}操作系统`, exact: true })
            .getByRole('button', { name: 'Windows' }),
        ).toHaveAttribute('aria-pressed', 'true')
      }
      await expect(
        page.getByRole('button', { name: '复制 AI 操作说明', exact: true }),
      ).toBeEnabled()
      expect(requests).toEqual(
        first === '受控机'
          ? [
              { current_platform: 'linux', platform: 'windows', operator_platform: 'linux' },
              { current_platform: 'windows', platform: 'windows', operator_platform: 'windows' },
            ]
          : [
              { current_platform: 'linux', platform: 'linux', operator_platform: 'windows' },
              { current_platform: 'linux', platform: 'windows', operator_platform: 'windows' },
            ],
      )
      await expect(
        page.getByText('echo synthetic-windows-customer-command', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('region', { name: '交给 AI 的操作说明', exact: true }),
      ).toContainText('PowerShell')
    } finally {
      release()
    }
  })
}

test('failed platform change clears pending choices without replaying queued mutations', async ({
  page,
}) => {
  await createSession(page)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let requests = 0
  await page.route('**/api/session/*/platform', async (route) => {
    requests += 1
    await gate
    await route.fulfill({
      status: 409,
      json: { error: { code: 'platform_conflict', message: '系统状态已变化，请确认状态。' } },
    })
  })
  try {
    const request = page.waitForRequest('**/api/session/*/platform')
    await page
      .getByRole('group', { name: '受控机操作系统', exact: true })
      .getByRole('button', { name: 'Windows' })
      .click()
    await request
    await page
      .getByRole('group', { name: '控制机操作系统', exact: true })
      .getByRole('button', { name: 'Windows' })
      .click()
    release()
    await expect(page.getByRole('alert').filter({ hasText: '操作未完成' })).toContainText(
      '后续系统选择尚未提交',
    )
    for (const label of ['受控机', '控制机']) {
      await expect(
        page
          .getByRole('group', { name: `${label}操作系统`, exact: true })
          .getByRole('button', { name: 'Windows' }),
      ).toBeEnabled()
      await expect(
        page
          .getByRole('group', { name: `${label}操作系统`, exact: true })
          .getByRole('button', { name: 'Linux' }),
      ).toHaveAttribute('aria-pressed', 'true')
    }
    await page.waitForTimeout(100)
    expect(requests).toBe(1)
  } finally {
    release()
  }
})

test('command page has two steps and AI instructions belong to the controller', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await createSession(page)
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['受控机', '控制机'])
  const controller = page.getByRole('region', { name: '控制机', exact: true })
  await expect(
    controller.getByRole('heading', { name: '交给 AI 的操作说明', exact: true }),
  ).toBeVisible()
  await expect(
    controller.getByRole('button', { name: '复制 AI 操作说明', exact: true }),
  ).toBeEnabled()
  await page.waitForTimeout(200)
  await page.screenshot({
    path: process.env.CONNECT_STEPS_DESKTOP_SCREENSHOT || 'test-results/steps-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({
    path: process.env.CONNECT_STEPS_MOBILE_SCREENSHOT || 'test-results/steps-mobile.png',
    fullPage: true,
  })
})
