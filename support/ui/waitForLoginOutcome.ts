import { expect, type Page, type Response } from '@playwright/test';
import { suspendedAccountMessage } from '../../fixtures/auth.fixture';
import { isBizflexLoginPostResponse } from '../../utils/loginResponse';
import { isAccountContextsResponseUrl } from './accountContextApi';

export type LoginOutcomeKind =
  | 'select-account'
  | 'account'
  | 'mfa'
  | 'suspended'
  | 'invalid-credentials'
  | 'login-error';

export type LoginOutcome = {
  kind: LoginOutcomeKind;
  url: string;
  message?: string;
  httpStatus?: number;
};

function pathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function isPostLoginRoute(path: string): LoginOutcomeKind | null {
  if (/^\/select-account(\/|$)/.test(path)) return 'select-account';
  if (/^\/account(\/|$)/.test(path)) return 'account';
  if (/^\/(mfa|2fa|verify|otp|two-factor)(\/|$)/.test(path)) return 'mfa';
  return null;
}

async function accountPickerShellVisible(page: Page): Promise<boolean> {
  return page.getByText(/choose an account to continue/i).isVisible().catch(() => false);
}

async function visibleLoginErrorMessage(page: Page): Promise<string | null> {
  const patterns = [
    /invalid (email|password|credentials)/i,
    /incorrect (email|password|credentials)/i,
    /wrong (email|password|credentials)/i,
    /login failed/i,
    /unable to (log|sign) in/i,
    /email or password/i,
    /unauthorized/i,
    /authentication failed/i,
  ];
  for (const re of patterns) {
    const el = page.getByText(re).first();
    if (await el.isVisible().catch(() => false)) {
      return (await el.innerText().catch(() => ''))?.trim() || re.source;
    }
  }
  return null;
}

async function mfaScreenVisible(page: Page): Promise<boolean> {
  if (isPostLoginRoute(pathname(page)) === 'mfa') return true;
  const otp = page.getByPlaceholder(/otp|verification code|2fa|authenticator/i).first();
  if (await otp.isVisible().catch(() => false)) return true;
  return (await page.getByText(/2fa|two-?factor|verification code|enter.*code/i).count()) > 0;
}

async function suspendedVisible(page: Page): Promise<boolean> {
  if (await page.getByText(suspendedAccountMessage).isVisible().catch(() => false)) return true;
  return page.getByText(/suspended|multiple incorrect login/i).isVisible().catch(() => false);
}

function messageFromLoginBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.message === 'string') return b.message;
  if (typeof b.error === 'string') return b.error;
  return undefined;
}

function requiresMfaFromBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return b.requires2FA === true || b.requiresTwoFactor === true;
}

async function evaluateLoginResponse(response: Response, page: Page): Promise<LoginOutcome | null> {
  const status = response.status();
  let body: unknown = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (status === 403) {
    const msg = messageFromLoginBody(body) ?? suspendedAccountMessage;
    if (msg.toLowerCase().includes('suspended') || msg === suspendedAccountMessage) {
      return { kind: 'suspended', url: page.url(), message: msg, httpStatus: status };
    }
    return { kind: 'login-error', url: page.url(), message: msg, httpStatus: status };
  }

  if (status === 401 || status === 400 || status === 422) {
    const msg = messageFromLoginBody(body) ?? `Login failed (HTTP ${status})`;
    const lower = msg.toLowerCase();
    const kind =
      lower.includes('invalid') ||
      lower.includes('incorrect') ||
      lower.includes('wrong') ||
      lower.includes('credential') ||
      lower.includes('password')
        ? 'invalid-credentials'
        : 'login-error';
    return { kind, url: page.url(), message: msg, httpStatus: status };
  }

  if (status >= 200 && status < 300) {
    if (requiresMfaFromBody(body)) {
      return { kind: 'mfa', url: page.url(), httpStatus: status };
    }
    return null;
  }

  if (status >= 400) {
    return {
      kind: 'login-error',
      url: page.url(),
      message: messageFromLoginBody(body) ?? `Login failed (HTTP ${status})`,
      httpStatus: status,
    };
  }

  return null;
}

function formatOutcomeError(outcome: LoginOutcome, email: string): string {
  const masked = email.replace(/(^.).*(@.*$)/, '$1***$2');
  switch (outcome.kind) {
    case 'invalid-credentials':
      return `Login failed for ${masked}: ${outcome.message ?? 'Invalid credentials'} (still on /login)`;
    case 'suspended':
      return `Login blocked for ${masked}: ${outcome.message ?? suspendedAccountMessage}`;
    case 'mfa':
      return `Login for ${masked} requires MFA/2FA — use MFA_USER_EMAIL or complete MFA manually (not automated in this flow)`;
    case 'login-error':
      return `Login error for ${masked}: ${outcome.message ?? 'unknown'} (HTTP ${outcome.httpStatus ?? 'n/a'})`;
    default:
      return `Unexpected login state: ${outcome.kind} url=${outcome.url}`;
  }
}

function stillOnLoginPage(page: Page): boolean {
  return /^\/login(\/|$)/i.test(pathname(page));
}

async function probeLoginState(
  page: Page,
  lastAuthResponse: Response | undefined,
  contextsLoaded: boolean
): Promise<LoginOutcome | null> {
  const route = isPostLoginRoute(pathname(page));
  if (route) {
    return { kind: route, url: page.url() };
  }

  if (await accountPickerShellVisible(page)) {
    return { kind: 'select-account', url: page.url() };
  }

  if (contextsLoaded && (await accountPickerShellVisible(page).catch(() => false))) {
    return { kind: 'select-account', url: page.url() };
  }

  if (contextsLoaded && !stillOnLoginPage(page)) {
    const path = pathname(page);
    if (path && path !== '/login') {
      return { kind: 'select-account', url: page.url() };
    }
  }

  if (await suspendedVisible(page)) {
    return { kind: 'suspended', url: page.url(), message: suspendedAccountMessage };
  }

  if (await mfaScreenVisible(page)) {
    return { kind: 'mfa', url: page.url() };
  }

  const uiError = await visibleLoginErrorMessage(page);
  if (uiError) {
    const kind = /invalid|incorrect|wrong|credential|password/i.test(uiError)
      ? 'invalid-credentials'
      : 'login-error';
    return { kind, url: page.url(), message: uiError };
  }

  if (lastAuthResponse) {
    const fromApi = await evaluateLoginResponse(lastAuthResponse, page);
    if (fromApi) return fromApi;
    if (lastAuthResponse.ok()) {
      const routeAfterOk = isPostLoginRoute(pathname(page));
      if (routeAfterOk) return { kind: routeAfterOk, url: page.url() };
    }
  }

  return null;
}

/**
 * After submitting the login form, wait for navigation or a definitive API/UI outcome.
 * Success: /select-account, /account, visible picker heading, or /contexts 200.
 */
export async function waitForLoginOutcomeAfterSubmit(
  page: Page,
  options: { timeoutMs?: number; emailForErrors?: string } = {}
): Promise<LoginOutcome> {
  const timeoutMs = options.timeoutMs ?? (process.env.CI ? 90_000 : 45_000);
  const emailForErrors = options.emailForErrors ?? 'user';
  let lastAuthResponse: Response | undefined;
  let contextsLoaded = false;

  const onResponse = (response: Response) => {
    if (isBizflexLoginPostResponse(response)) {
      lastAuthResponse = response;
    }
    if (response.ok() && isAccountContextsResponseUrl(response.url())) {
      contextsLoaded = true;
    }
  };
  page.on('response', onResponse);

  try {
    let outcome: LoginOutcome | null = null;

    await expect
      .poll(
        async () => {
          outcome = await probeLoginState(page, lastAuthResponse, contextsLoaded);
          return outcome !== null;
        },
        {
          timeout: timeoutMs,
          intervals: [200, 400, 800, 1_000],
          message: `Login did not reach account picker, /account, MFA, or a visible error within ${timeoutMs}ms (url=${page.url()})`,
        }
      )
      .toBe(true);

    if (!outcome) {
      outcome = await probeLoginState(page, lastAuthResponse, contextsLoaded);
    }

    if (!outcome) {
      if (stillOnLoginPage(page)) {
        throw new Error(
          `Login submit finished but still on /login (url=${page.url()}). ` +
            `Likely invalid credentials for ${emailForErrors.replace(/(^.).*(@.*$)/, '$1***$2')} ` +
            `or login API wait mismatch — verify UI_USER_EMAIL/UI_USER_PASSWORD (or TEST_EMAIL/TEST_PASSWORD) and AUTH_API_LOGIN_PATH.`
        );
      }
      throw new Error(
        `Login submit timed out after ${timeoutMs}ms — still on ${page.url()}. ` +
          `Check credentials, API_URL (${process.env.API_URL ?? 'unset'}), ` +
          `AUTH_API_LOGIN_PATH (${process.env.AUTH_API_LOGIN_PATH ?? '/v1/auth/login'}).`
      );
    }

    if (
      outcome.kind === 'invalid-credentials' ||
      outcome.kind === 'suspended' ||
      outcome.kind === 'mfa' ||
      outcome.kind === 'login-error'
    ) {
      throw new Error(formatOutcomeError(outcome, emailForErrors));
    }

    return outcome;
  } finally {
    page.off('response', onResponse);
  }
}
