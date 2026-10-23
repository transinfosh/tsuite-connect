import { test, expect } from '@playwright/test'
import { login, totp } from './helpers'

test('anonymous users see GitHub organization requirements and mobile login', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/connect/')
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await expect(page.getByText('transinfosh', { exact: true })).toBeVisible()
  await expect(page.getByText('support', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  expect(errors).toEqual([])
})

test('login, close failure and retry, create, OS switching, users and logout stay in one page', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page)
  await expect(page.getByRole('link', { name: '012345abcdef' })).toBeVisible()
  await page.waitForTimeout(250)
  await page.screenshot({
    path: process.env.CONNECT_DESKTOP_SCREENSHOT || 'test-results/desktop.png',
    fullPage: true,
  })
  await page.getByRole('tab', { name: '已连接', exact: true }).click()
  await expect(page.getByRole('link', { name: 'fedcba543210' })).toHaveCount(0)
  await page.getByRole('tab', { name: /全部会话/ }).click()
  await page.getByLabel('搜索客户或会话 ID').fill('northwind')
  await expect(page.getByRole('link', { name: 'aa11bb22cc33' })).toBeVisible()
  await expect(page.getByRole('link', { name: '012345abcdef' })).toHaveCount(0)
  await page.getByLabel('搜索客户或会话 ID').fill('')
  await page.evaluate(() => {
    window.__spaIdentity = 'same-page'
  })
  await page.getByRole('link', { name: '012345abcdef' }).click()
  await expect(page.getByRole('heading', { name: '会话详情' })).toBeVisible()
  await page.getByRole('button', { name: '关闭会话', exact: true }).click()
  await page.getByRole('button', { name: '确认关闭', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('客户侧清理未确认')
  await page.getByRole('button', { name: '确认关闭', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('会话已结束，不再接受客户连接。')).toBeVisible()
  await page.getByRole('button', { name: '返回会话列表', exact: true }).click()
  await page.getByRole('button', { name: '新建会话', exact: true }).click()
  await page.getByLabel('客户环境标识', { exact: true }).fill('browser-test-customer')
  await page.getByRole('button', { name: '创建会话', exact: true }).click()
  await expect(page.getByRole('heading', { name: '会话已创建' })).toBeVisible()
  await expect(page.getByText('echo synthetic-customer-command', { exact: true })).toBeVisible()
  await page
    .getByLabel('客户执行命令操作系统', { exact: true })
    .getByRole('button', { name: 'Windows' })
    .click()
  await expect(
    page.getByText('echo synthetic-windows-customer-command', { exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('支持机执行命令操作系统', { exact: true })
    .getByRole('button', { name: 'Windows' })
    .click()
  await expect(
    page.getByLabel('客户执行命令操作系统').getByRole('button', { name: 'Windows' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByLabel('支持机执行命令操作系统').getByRole('button', { name: 'Windows' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => window.__spaIdentity)).toBe('same-page')
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  expect(page.url()).not.toContain('synthetic-grant')
  await page.getByRole('button', { name: '返回会话列表', exact: true }).click()
  await expect(page.getByRole('link', { name: '000000000001' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({
    path: process.env.CONNECT_MOBILE_SCREENSHOT || 'test-results/mobile.png',
    fullPage: true,
  })
  await page.getByRole('link', { name: '用户管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible()
  await page.getByLabel('用户名', { exact: true }).fill('browser-user')
  await page.getByLabel('显示名称', { exact: true }).fill('Browser User')
  await page.getByLabel('角色', { exact: true }).selectOption('operator')
  await page.getByRole('button', { name: '生成邀请链接' }).click()
  await expect(page.getByRole('heading', { name: '一次性绑定链接' })).toBeVisible()
  const inviteUrl = await page.locator('pre.command-code').innerText()
  await page.getByRole('button', { name: '账户菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await page.goto(inviteUrl)
  await expect(page.getByRole('heading', { name: '设置你的账号' })).toBeVisible()
  await page.getByLabel('密码 · 至少 16 位', { exact: true }).fill('new-user-password-123')
  await page.getByLabel('再次输入密码', { exact: true }).fill('new-user-password-123')
  await page.getByRole('button', { name: '继续绑定验证器' }).click()
  await expect(page.getByRole('heading', { name: '绑定验证器' })).toBeVisible()
  await page.getByText('无法扫码？手动绑定').click()
  const secret = await page.locator('code.secret').innerText()
  await page.getByLabel('动态验证码', { exact: true }).fill(totp(secret))
  await page.getByRole('button', { name: '完成绑定', exact: true }).click()
  await expect(page.getByRole('heading', { name: '账号已启用' })).toBeVisible()
  expect(errors).toEqual([])
})

test('shadcn dialog supports keyboard focus and the content security policy', async ({ page }) => {
  await page.addInitScript(() => {
    window.__policyErrors = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__policyErrors.push(event.violatedDirective)
    })
  })
  await login(page)
  const trigger = page.getByRole('button', { name: '新建会话', exact: true })
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('客户环境标识', { exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => window.__policyErrors)).toEqual([])
})
