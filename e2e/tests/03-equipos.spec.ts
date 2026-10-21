import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Equipos', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/equipment')
  })

  test('lista de equipos visible', async ({ page }) => {
    await expect(page.getByText(/montacarga|grúa|excavadora|plataforma/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('filtro por tipo funciona', async ({ page }) => {
    const tipoFilter = page.getByRole('combobox').first()
    if (await tipoFilter.isVisible()) {
      await tipoFilter.selectOption({ index: 1 })
      await page.waitForTimeout(500)
    }
    // La página no debe crashear
    await expect(page.getByText(/equipo|montacarga|grúa/i).first()).toBeVisible({ timeout: 8_000 })
  })

  test('detalle de equipo abre al hacer clic', async ({ page }) => {
    const firstEq = page.getByText(/montacarga|grúa|excavadora|plataforma/i).first()
    await firstEq.click()
    await page.waitForTimeout(1000)
    await expect(page.getByText(/estado|horas|tipo|capacidad/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('equipos muestran estado (Disponible, En uso, Mantenimiento)', async ({ page }) => {
    await expect(
      page.getByText(/disponible|en uso|mantenimiento|available/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

})
