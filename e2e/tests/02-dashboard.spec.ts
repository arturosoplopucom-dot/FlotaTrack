import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => { await login(page) })

  test('muestra KPIs principales', async ({ page }) => {
    await expect(page.getByText(/facturación|ingresos|cobrado/i).first()).toBeVisible()
    await expect(page.getByText(/equipo|flota/i).first()).toBeVisible()
  })

  test('navegación sidebar — Equipos', async ({ page }) => {
    await page.goto('/equipment')
    await expect(page).toHaveURL(/equipment/)
    await expect(page.getByText(/montacarga|grúa|excavadora/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('navegación sidebar — Cotizaciones', async ({ page }) => {
    await page.goto('/quotes')
    await expect(page).toHaveURL(/quotes/)
    await expect(page.getByText(/cotizaci/i).first()).toBeVisible({ timeout: 6_000 })
  })

  test('navegación sidebar — Liquidaciones', async ({ page }) => {
    await page.goto('/workorders')
    await expect(page).toHaveURL(/workorders/)
    await expect(page.getByText(/liquidaci/i).first()).toBeVisible({ timeout: 6_000 })
  })

  test('navegación sidebar — Clientes', async ({ page }) => {
    await page.goto('/clients')
    await expect(page).toHaveURL(/clients/)
    await expect(page.getByText(/clientes/i).first()).toBeVisible({ timeout: 6_000 })
  })

  test('buscador global está presente', async ({ page }) => {
    const search = page.getByPlaceholder(/buscar/i).first()
    await expect(search).toBeVisible()
  })

})
