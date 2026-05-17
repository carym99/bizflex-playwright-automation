import { Before, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { setDefaultTimeout } from '@cucumber/cucumber';
import { E2EWorld } from '../support/world';
import { LoginPage } from '../../pages/LoginPage';
import { SelectAccountPage } from '../../pages/SelectAccountPage';
import { getUiEmail, getUiPassword } from '../../fixtures/auth.fixture';
import {
  businessEnvSkipReason,
  freelanceEnvSkipReason,
  resolveBusinessAccountContextFromEnv,
  resolveFreelanceAccountContextFromEnv,
} from '../../config/accountContext';
import { urlIsAccountDashboard } from '../../support/ui/accountRoutes';
import { attachAccountContextCapture } from '../../support/ui/accountContextApi';
import { selectAccountOnPicker } from '../../support/ui/selectAccount';
import { gotoWithRetry } from '../../support/ui/navigation';

setDefaultTimeout(120_000);

function pageOrThrow(world: E2EWorld) {
  if (!world.page) throw new Error('Browser page not initialized — check e2e hooks');
  return world.page;
}

Before({ tags: '@requires-freelance-config' }, function () {
  const reason = freelanceEnvSkipReason();
  if (reason) return reason;
});

Before({ tags: '@requires-business-config' }, function () {
  const reason = businessEnvSkipReason('default');
  if (reason) return reason;
});

Before({ tags: '@requires-second-business-config' }, function () {
  const reason = businessEnvSkipReason('secondary');
  if (reason) return reason;
});

When('I sign in and reach the account picker', async function (this: E2EWorld) {
  const page = pageOrThrow(this);
  attachAccountContextCapture(page);
  const loginPage = new LoginPage(page);
  await loginPage.uiLogin(getUiEmail(), getUiPassword(), undefined, {
    completeAccountSelection: false,
  });
  const picker = new SelectAccountPage(page);
  await picker.assertPickerShellVisible();
});

Then('I should see the account picker', async function (this: E2EWorld) {
  const picker = new SelectAccountPage(pageOrThrow(this));
  await expect(picker.pickerHeading()).toHaveText(/choose an account to continue/i);
  const count = await picker.countVisibleAccountCards();
  expect(count, 'Expected at least one workspace on the picker').toBeGreaterThan(0);
});

Then('I should see the Continue action', async function (this: E2EWorld) {
  await expect(new SelectAccountPage(pageOrThrow(this)).continueButton()).toBeVisible();
});

Then('I should see the option to add a new account', async function (this: E2EWorld) {
  await expect(new SelectAccountPage(pageOrThrow(this)).addNewAccountButton()).toBeVisible();
});

Then('I should see my configured freelance account on the picker', async function (this: E2EWorld) {
  const freelance = resolveFreelanceAccountContextFromEnv();
  await new SelectAccountPage(pageOrThrow(this)).assertConfiguredAccountVisible(freelance);
});

Then('I should see my configured business account on the picker', async function (this: E2EWorld) {
  const business = resolveBusinessAccountContextFromEnv('default');
  await new SelectAccountPage(pageOrThrow(this)).assertConfiguredAccountVisible(business);
});

Then('I should see my second configured business account on the picker', async function (this: E2EWorld) {
  const business = resolveBusinessAccountContextFromEnv('secondary');
  await new SelectAccountPage(pageOrThrow(this)).assertConfiguredAccountVisible(business);
});

When('I choose my configured freelance workspace', async function (this: E2EWorld) {
  const freelance = resolveFreelanceAccountContextFromEnv();
  await selectAccountOnPicker(pageOrThrow(this), { ...freelance, accountType: 'freelance' });
});

When('I choose my configured business workspace', async function (this: E2EWorld) {
  const business = resolveBusinessAccountContextFromEnv('default');
  await selectAccountOnPicker(pageOrThrow(this), { ...business, accountType: 'business' });
});

When('I choose my second configured business workspace', async function (this: E2EWorld) {
  const business = resolveBusinessAccountContextFromEnv('secondary');
  await selectAccountOnPicker(pageOrThrow(this), { ...business, accountType: 'business' });
});

When('I open the account picker again', async function (this: E2EWorld) {
  await gotoWithRetry(pageOrThrow(this), '/select-account', { waitUntil: 'domcontentloaded' });
  await new SelectAccountPage(pageOrThrow(this)).assertPickerShellVisible();
});

Then('I should be on the account dashboard', async function (this: E2EWorld) {
  await expect(pageOrThrow(this)).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
});
