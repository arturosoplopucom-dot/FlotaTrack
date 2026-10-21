import { Page } from '@playwright/test'

export const CREDENTIALS = { ruc: '20603350309', email: 'admin@gruasomega.pe', password: 'admin123' }
export const BASE = 'http://localhost:5175'

export async function login(page: Page) {
  await page.goto('/login')
  await page.locator('input[name="ruc"]').fill(CREDENTIALS.ruc)
  await page.locator('input[name="email"]').fill(CREDENTIALS.email)
  await page.locator('input[name="password"]').fill(CREDENTIALS.password)
  await page.getByRole('button', { name: /ingresar/i }).click()
  await page.waitForURL(/dashboard/, { timeout: 12_000 })
}
