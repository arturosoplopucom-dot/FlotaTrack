import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Liquidaciones (Órdenes de Trabajo)', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/workorders')
  })

  test('página de liquidaciones carga', async ({ page }) => {
    await expect(page.getByText(/liquidaci/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('OT-0001 aparece en la lista', async ({ page }) => {
    await expect(page.getByText(/OT-0001/)).toBeVisible({ timeout: 8_000 })
  })

  test('OT-0001 muestra estado Completada', async ({ page }) => {
    await expect(page.getByText(/OT-0001/)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/completada/i).first()).toBeVisible({ timeout: 6_000 })
  })

  test('abrir detalle de OT-0001', async ({ page }) => {
    await page.getByRole('button', { name: /ver detalle/i }).first().click()
    await page.waitForTimeout(1000)
    await expect(
      page.getByText(/subtotal|cliente|equipo|estado/i).first()
    ).toBeVisible({ timeout: 6_000 })
  })

  test('flujo de estados — OT-0001 está en Completada', async ({ page }) => {
    await expect(page.getByText(/OT-0001/)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/completada/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('partes de servicio (reports) visibles en OT', async ({ page }) => {
    await page.getByRole('button', { name: /ver detalle/i }).first().click()
    await page.waitForTimeout(1000)
    await expect(
      page.getByText(/montacarga|talma|cliente|equipo/i).first()
    ).toBeVisible({ timeout: 6_000 })
  })

})
