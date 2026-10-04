import { expect, type Page } from "@playwright/test";

/** Open explicitly even when retaining the default currency. */
export async function selectCurrency(page: Page, currency: string) {
  const input = page.getByRole("combobox", { name: "Currency", exact: true });
  await input.click();
  await input.fill(currency);
  await page.getByRole("option", { name: new RegExp(`^${currency} `) }).click();
  await expect(input).toHaveValue(currency);
  await expect(input).toHaveAttribute("aria-expanded", "false");
}
