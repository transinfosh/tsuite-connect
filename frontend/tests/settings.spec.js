import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('administrator changes global idle policy and reloads it without affecting existing sessions', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '系统设置', exact: true }).click()
  await expect(page.getByRole('heading', { name: '系统设置', exact: true })).toBeVisible()
  const input = page.getByLabel('默认闲置超时（分钟）')
  await expect(input).toHaveValue('360')
  await input.fill('240')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已保存')
  await page.reload()
  await expect(input).toHaveValue('240')
  await expect(page.getByText('已有会话保持原期限', { exact: false })).toBeVisible()
  await input.fill('360')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已保存')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})
