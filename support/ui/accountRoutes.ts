/**
 * Post-login routing: https://bizflex-app.netlify.app/select-account
 * Avoid treating `/select-account` as the `/account` dashboard (pathname substring "account" is ambiguous).
 */

export function pathnameLooksLikeSelectAccountPath(pathname: string): boolean {
  const p = pathname.trim().toLowerCase();
  return /^\/select-account(\/|$)/i.test(p);
}

/** Main wallet dashboard after an account context is active (not the picker). */
export function pathnameLooksLikeAccountDashboardPath(pathname: string): boolean {
  const p = pathname.trim().toLowerCase();
  return /^\/account(\/|$)/i.test(p);
}

/** Use with `expect(page).toHaveURL(...)` so `/select-account` is not mistaken for `/account`. */
export function urlIsAccountDashboard(url: URL): boolean {
  return pathnameLooksLikeAccountDashboardPath(url.pathname);
}

/** Authenticated app shell: picker, dashboard, or other known logged-in routes (never `/login`). */
export function pathnameIsAuthenticatedShellPath(pathname: string): boolean {
  const p = pathname.trim().toLowerCase();
  if (/^\/login(\/|$)/i.test(p)) return false;
  return (
    pathnameLooksLikeSelectAccountPath(p) ||
    pathnameLooksLikeAccountDashboardPath(p) ||
    p.includes('payment-link') ||
    /\/transactions?(\/|$)/i.test(p)
  );
}
