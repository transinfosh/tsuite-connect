import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('primary navigation visibly distinguishes the selected destination after focus leaves', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page)
  const nav = page.getByRole('navigation', { name: '主导航' })
  const sessions = nav.getByRole('link', { name: '远程会话', exact: true })
  const users = nav.getByRole('link', { name: '用户管理', exact: true })
  const background = (link) => link.evaluate((node) => getComputedStyle(node).backgroundColor)
  await page.mouse.click(1, 700)
  await expect(sessions).toHaveAttribute('aria-current', 'page')
  expect(await background(sessions)).not.toBe(await background(users))
  await users.click()
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible()
  await page.mouse.click(1, 700)
  await expect(users).toHaveAttribute('aria-current', 'page')
  await expect(sessions).not.toHaveAttribute('aria-current', 'page')
  expect(await background(users)).not.toBe(await background(sessions))
  const footer = page.getByRole('contentinfo')
  await expect(footer).toContainText('tSuite Connect. 保留所有权利。')
  const short = await footer.boundingBox()
  expect(Math.abs(short.y + short.height - 1000)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 390, height: 400 })
  const main = await page.getByRole('main').boundingBox()
  const long = await footer.boundingBox()
  expect(long.y).toBeGreaterThanOrEqual(main.y + main.height - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})
