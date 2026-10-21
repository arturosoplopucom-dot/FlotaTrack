import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Reportes', () => {

  test.beforeEach(async ({ page }) => { await login(page) })

  test('Rentabilidad por Equipo — MONTACARGA 3 TON aparece con ingresos', async ({ page }) => {
    await page.goto('/reports/rentabilidad')
    // Usar locator de tabla para evitar strict mode (el filter select también tiene el texto)
    await expect(page.locator('table').getByText(/MONTACARGA 3 TON/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/2,871|2871/).first()).toBeVisible({ timeout: 8_000 })
  })

  test('Rentabilidad por Equipo — MONTACARGA 7 TON aparece con ingresos', async ({ page }) => {
    await page.goto('/reports/rentabilidad')
    await expect(page.locator('table').getByText(/MONTACARGA 7 TON/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/1,452|1452/).first()).toBeVisible({ timeout: 8_000 })
  })

  test('Rentabilidad por Equipo — Total ingresos es S/ 4,323', async ({ page }) => {
    await page.goto('/reports/rentabilidad')
    await expect(page.getByText(/4,323/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Rentabilidad por Equipo — badge OT-0001 visible en ambos montacargas', async ({ page }) => {
    await page.goto('/reports/rentabilidad')
    const otBadges = page.getByText(/OT-0001/)
    await expect(otBadges.first()).toBeVisible({ timeout: 10_000 })
    const count = await otBadges.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('Rentabilidad — filtro de período funciona', async ({ page }) => {
    await page.goto('/reports/rentabilidad')
    const periodoSelect = page.getByRole('combobox').last()
    await periodoSelect.selectOption('1m')
    await page.waitForTimeout(1000)
    await expect(page.locator('table').getByText(/MONTACARGA|equipo/i).first()).toBeVisible({ timeout: 6_000 })
  })

  test('Rentabilidad — tab Detalle por Equipo', async ({ page }) => {
    await page.goto('/reports/rentabilidad')
    await page.getByRole('button', { name: /detalle/i }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('table').getByText(/MONTACARGA/i).first()).toBeVisible({ timeout: 6_000 })
  })

})
