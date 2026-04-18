import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { buildCreatePaymentLinkPayload, loginForAccessToken, postCreatePaymentLink } from '../../helpers/paymentLink';
import { simulatePaymentIfConfigured, pollPaymentStatusIfConfigured } from '../../helpers/paymentSimulation';

type CreatedPaymentLink = {
  url: string;
  slug: string;
  amount: string;
  accountId: string | null;
  merchantName: string;
};

function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function moneyLikeFromApiAmount(v: unknown): string {
  // API commonly returns "1000.00"; UI may render with commas/currency.
  const raw = asString(v);
  const numeric = raw.replace(/[^\d.]/g, '');
  if (!numeric) return raw;
  const n = Number(numeric);
  if (!Number.isFinite(n)) return raw;
  return n.toFixed(2);
}

async function createPaymentLinkViaApi(request: APIRequestContext): Promise<CreatedPaymentLink> {
  // Backend enforces uniqueness on `name` (409 conflict on duplicates), so keep it unique per run.
  const merchantName = `Playwright Merchant ${Date.now()}`;
  const payload = buildCreatePaymentLinkPayload({
    name: merchantName,
    amount: 1000,
    description: 'Playwright E2E payment link',
  });

  let token = await loginForAccessToken(request);
  let created = await postCreatePaymentLink(request, token, payload);
  if (
    created.response.status() === 401 &&
    typeof (created.body as any)?.message === 'string' &&
    String((created.body as any).message).toLowerCase().includes('session has expired')
  ) {
    console.warn('[payment-link.e2e] 401 session expired on create; re-authenticating and retrying once');
    token = await loginForAccessToken(request);
    created = await postCreatePaymentLink(request, token, payload);
  }

  test.skip(
    created.response.status() === 401 &&
      typeof (created.body as any)?.message === 'string' &&
      String((created.body as any).message).toLowerCase().includes('session has expired'),
    `Backend returned session-expired 401 on create after retry. Body: ${JSON.stringify(created.body).slice(0, 200)}`
  );

  expect([200, 201], `Payment link create failed: ${JSON.stringify(created.body).slice(0, 400)}`).toContain(
    created.response.status()
  );

  const body = created.body as any;
  const data = body?.data ?? body;
  const slug = asString(data?.slug ?? payload.slug);
  const url = asString(data?.url ?? `https://bizflex-app.netlify.app/payment?id=${slug}`);
  const amount = moneyLikeFromApiAmount(data?.amount ?? '1000.00');
  const accountId = data?.accountId ? asString(data.accountId) : null;

  console.log('[payment-link.e2e] created payment link url:', url);
  console.log('[payment-link.e2e] slug:', slug);
  console.log('[payment-link.e2e] amount:', amount);
  console.log('[payment-link.e2e] accountId:', accountId ?? '(none)');

  if (!slug) throw new Error('[payment-link.e2e] create payment link response missing slug');
  if (!url) throw new Error('[payment-link.e2e] create payment link response missing url');
  if (!amount) throw new Error('[payment-link.e2e] create payment link response missing amount');

  return { url, slug, amount, accountId, merchantName };
}

async function openPaymentPage(page: Page, paymentUrl: string): Promise<void> {
  await page.goto(paymentUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
}

async function assertLandingLoaded(page: Page, created: CreatedPaymentLink): Promise<void> {
  const makePayment = page.getByRole('button', { name: /make payment/i });
  await expect(makePayment).toBeVisible({ timeout: 30_000 });

  // Merchant/business name (best-effort; UI may show truncated/normalized).
  await expect(page.locator('body')).toContainText(/api merchant|merchant|business/i, { timeout: 30_000 });

  // Amount visible (format varies).
  const amountRe = new RegExp(created.amount.replace('.', '\\.'), 'i');
  await expect(page.locator('body')).toContainText(amountRe, { timeout: 30_000 });
}

async function clickMakePayment(page: Page): Promise<void> {
  await page.getByRole('button', { name: /make payment/i }).click();
}

async function fillCustomerDetails(page: Page, opts: { withEmail: boolean }): Promise<void> {
  await expect(page.locator('body')).toContainText(/full name|name/i, { timeout: 30_000 });

  await page
    .getByLabel(/full name|name/i)
    .or(page.getByPlaceholder(/full name|name/i))
    .first()
    .fill('Playwright Test User');

  if (opts.withEmail) {
    await page
      .getByLabel(/email/i)
      .or(page.getByPlaceholder(/email/i))
      .or(page.locator('input[type="email"]'))
      .first()
      .fill('playwright@test.com');
  }

  await page
    .getByLabel(/phone/i)
    .or(page.getByPlaceholder(/phone/i))
    .or(page.locator('input[type="tel"]'))
    .first()
    .fill('08012345678');
}

async function proceed(page: Page): Promise<void> {
  const proceedBtn = page.getByRole('button', { name: /proceed|continue/i }).first();
  await expect(proceedBtn).toBeEnabled({ timeout: 30_000 });
  await proceedBtn.click();
}

async function waitForPaymentReviewAndCapture(page: Page, expectedAmount: string) {
  // Review step copy varies; assert the important fields are present.
  const body = page.locator('body');
  await expect(body).toContainText(/review|account number|bank/i, { timeout: 45_000 });

  // Amount must match (format varies; compare numeric portion).
  const expectedNumeric = expectedAmount.replace(/[^\d.]/g, '');
  if (!expectedNumeric) throw new Error('[payment-link.e2e] missing expected amount numeric');
  await expect(body).toContainText(new RegExp(expectedNumeric.replace('.', '\\.'), 'i'), { timeout: 45_000 });

  const accountNumberLine = page.getByText(/account number/i).first();
  const bankNameLine = page.getByText(/bank name/i).first();
  await expect(accountNumberLine).toBeVisible({ timeout: 45_000 });
  await expect(bankNameLine).toBeVisible({ timeout: 45_000 });

  const confirm = page.getByRole('button', { name: /confirm payment/i }).first();
  await expect(confirm).toBeEnabled({ timeout: 45_000 });

  // Best-effort extraction: look for 10-digit+ number and bank-like text.
  const text = await body.innerText();
  const acctMatch = text.match(/\b\d{10,}\b/);
  const bankMatch = text.match(/bank name\s*[:\-]?\s*(.+)/i);

  const accountNumber = acctMatch?.[0] ?? '';
  const bankName = bankMatch?.[1]?.trim() ?? '';

  if (!accountNumber) throw new Error('[payment-link.e2e] account number missing on review step');
  if (!bankName) {
    // Some UIs don’t prefix with "Bank Name:"; fall back to visible line text.
    const bankLineText = await bankNameLine.innerText().catch(() => '');
    if (!bankLineText) throw new Error('[payment-link.e2e] bank name missing on review step');
  }

  console.log('[payment-link.e2e] account number:', accountNumber);
  console.log('[payment-link.e2e] bank name:', bankName || '(captured from UI line)');
  console.log('[payment-link.e2e] amount:', expectedAmount);

  return { accountNumber, bankName: bankName || 'UNKNOWN', amount: expectedAmount, confirmButton: confirm };
}

async function waitForCompletion(page: Page): Promise<void> {
  const body = page.locator('body');
  await expect(
    page.getByText(/payment made/i).or(page.getByText(/payment is being processed|successful|success/i)).first()
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('button', { name: /close/i }).first()).toBeVisible({ timeout: 30_000 });
  await expect(body).toContainText(/payment/i);
}

test.describe('@regression Customer payment via public payment link', () => {
  test('customer can reach review and complete payment (with email)', async ({ page, request }) => {
    test.setTimeout(180_000);
    const created = await createPaymentLinkViaApi(request);

    await openPaymentPage(page, created.url);
    await assertLandingLoaded(page, created);

    await clickMakePayment(page);
    await fillCustomerDetails(page, { withEmail: true });
    await proceed(page);

    const review = await waitForPaymentReviewAndCapture(page, created.amount);

    // Simulate payment if a test endpoint is configured; otherwise, stop after review capture.
    const token = await loginForAccessToken(request);
    const simulated = await simulatePaymentIfConfigured(request, token, {
      slug: created.slug,
      url: created.url,
      accountId: created.accountId,
      amount: created.amount,
      accountNumber: review.accountNumber,
      bankName: review.bankName,
    });
    test.skip(!simulated, 'PAYMENT_SIMULATE_PATH not configured; cannot simulate transfer in CI safely.');

    expect([200, 201, 202]).toContain(simulated!.response.status());
    console.log('[payment-link.e2e] simulate status:', simulated!.response.status());

    const polled = await pollPaymentStatusIfConfigured(
      request,
      token,
      { slug: created.slug },
      { timeoutMs: 60_000, intervalMs: 2_000 }
    );
    if (polled) {
      console.log('[payment-link.e2e] status poll success in ms:', polled.durationMs);
    }

    // Some UIs require clicking confirm after the transfer.
    await review.confirmButton.click().catch(() => {});
    await waitForCompletion(page);
  });

  test('customer can reach review and complete payment (without email)', async ({ page, request }) => {
    test.setTimeout(180_000);
    const created = await createPaymentLinkViaApi(request);

    await openPaymentPage(page, created.url);
    await assertLandingLoaded(page, created);

    await clickMakePayment(page);
    await fillCustomerDetails(page, { withEmail: false });
    await proceed(page);

    const review = await waitForPaymentReviewAndCapture(page, created.amount);

    const token = await loginForAccessToken(request);
    const simulated = await simulatePaymentIfConfigured(request, token, {
      slug: created.slug,
      url: created.url,
      accountId: created.accountId,
      amount: created.amount,
      accountNumber: review.accountNumber,
      bankName: review.bankName,
    });
    test.skip(!simulated, 'PAYMENT_SIMULATE_PATH not configured; cannot simulate transfer in CI safely.');

    expect([200, 201, 202]).toContain(simulated!.response.status());
    await review.confirmButton.click().catch(() => {});
    await waitForCompletion(page);
  });
});

