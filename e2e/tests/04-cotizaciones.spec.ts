import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Cotizaciones', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/quotes')
  })

  test('página de cotizaciones carga', async ({ page }) => {
    await expect(page.getByText(/cotizaci/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('lista muestra cotizaciones existentes', async ({ page }) => {
    await expect(page.getByText(/COT-/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('cotización tiene estado visible', async ({ page }) => {
    await expect(
      page.getByText(/borrador|enviada|aprobada|rechazada|convertida/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('botón nueva cotización existe', async ({ page }) => {
    const btn = page.getByRole('button', { name: /nueva cotizaci|nueva cot/i })
    await expect(btn).toBeVisible()
  })

  test('abrir detalle de cotización', async ({ page }) => {
    const firstCot = page.getByText(/COT-0001/).first()
    await firstCot.click()
    await page.waitForTimeout(1000)
    await expect(
      page.getByText(/subtotal|total|cliente|vigencia/i).first()
    ).toBeVisible({ timeout: 6_000 })
  })

  test('nueva cotización — formulario abre', async ({ page }) => {
    await page.getByRole('button', { name: /nueva cotizaci|nueva cot/i }).click()
    await page.waitForTimeout(800)
    await expect(
      page.getByText(/cliente|equipo|fecha/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

})
