import { test, expect } from '@playwright/test'
import { CREDENTIALS } from './helpers'

test.describe('Autenticación', () => {

  test('login exitoso redirige al dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[name="ruc"]').fill(CREDENTIALS.ruc)
    await page.locator('input[name="email"]').fill(CREDENTIALS.email)
    await page.locator('input[name="password"]').fill(CREDENTIALS.password)
    await page.getByRole('button', { name: /ingresar/i }).click()
    await page.waitForURL(/dashboard/, { timeout: 12_000 })
    await expect(page).not.toHaveURL(/login/)
  })

  test('credenciales incorrectas permanece en login', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[name="ruc"]').fill('20000000000')
    await page.locator('input[name="email"]').fill('incorrecto@test.com')
    await page.locator('input[name="password"]').fill('wrongpass')
    await page.getByRole('button', { name: /ingresar/i }).click()
    await page.waitForTimeout(3000)
    await expect(page).toHaveURL(/login/)
  })

  test('ruta protegida redirige a login sin sesión', async ({ page }) => {
    await page.goto('/equipos')
    await page.waitForURL(/login/, { timeout: 8_000 })
    await expect(page).toHaveURL(/login/)
  })

})
