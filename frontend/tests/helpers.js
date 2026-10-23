import { expect } from '@playwright/test'
import { createHmac } from 'node:crypto'

export function totp(secret = 'JBSWY3DPEHPK3PXP') {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0'))
    .join('')
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const hash = createHmac('sha1', key).update(counter).digest()
  const offset = hash.at(-1) & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}

export async function login(page) {
  await page.goto('/connect/')
  await page.getByLabel('账号', { exact: true }).fill('support-admin')
  await page.getByLabel('密码', { exact: true }).fill('preview-password-123')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.getByLabel('动态验证码', { exact: true }).fill(totp())
  await page.getByRole('button', { name: '确认登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '远程会话', exact: true })).toBeVisible()
}
