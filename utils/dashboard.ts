import { expect, type Page } from '@playwright/test';
import { transactionSelectors } from './selectors';
import { urlIsAccountDashboard } from '../support/ui/accountRoutes';

export async function assertStableDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
  const body = page.locator('body');
  await expect(body).toContainText(/quick action|dashboard|account|recent transactions/i, {
    timeout: 20_000,
  });
}

/** Account dashboard: “Recent transactions” label plus a table or an explicit empty state */
export async function assertRecentTransactionsTableVisible(page: Page): Promise<void> {
  await expect(page.getByText(/recent transactions/i).first()).toBeVisible({ timeout: 25_000 });

  const region = page.locator(transactionSelectors.recentTransactionsRegion).first();
  const tableInRegion = region.locator(transactionSelectors.table).first();
  const emptyInRegion = region.getByText(/no transaction|no recent|nothing (here|to show)|empty/i).first();

  const mainTable = page.locator('main table, [role="main"] table').first();
  const globalEmpty = page.getByText(/no transaction|nothing (here|to show)|empty/i).first();

  await expect(tableInRegion.or(emptyInRegion).or(mainTable).or(globalEmpty)).toBeVisible({
    timeout: 25_000,
  });
}

