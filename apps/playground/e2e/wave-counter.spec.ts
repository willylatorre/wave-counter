import { expect, test } from '@playwright/test'

for (const backend of ['fastapi', 'express'] as const) {
  test(`${backend} records, analyzes, and persists events`, async ({ page }) => {
    await page.goto(`/?backend=${backend}`)
    const counter = page.getByRole('button', { name: /Add one coffee/ })

    await expect(page.getByRole('heading', { name: 'Wave Counter playground' })).toBeVisible()
    await expect(page.getByLabel('Backend')).toHaveValue(backend)
    const initialTotal = Number((await counter.textContent())?.trim())
    expect(Number.isFinite(initialTotal)).toBe(true)

    await counter.click()
    await expect(counter).toContainText(String(initialTotal + 1))

    await counter.click({ button: 'right' })
    await expect(page.getByRole('dialog', { name: 'Coffee statistics' })).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText(String(initialTotal + 1))
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()

    await page.reload()
    await expect(counter).toContainText(String(initialTotal + 1))
  })
}

test('switches backend without reloading the playground', async ({ page }) => {
  await page.goto('/?backend=fastapi')

  await page.getByLabel('Backend').selectOption('express')

  await expect(page).toHaveURL(/backend=express/)
  await expect(page.getByText('Connected through Express')).toBeVisible()
  await expect(page.getByRole('button', { name: /Add one coffee/ })).toBeVisible()
})
