export type LoginSuccessShape = {
  success?: boolean;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
  token?: string;
};

export function isLoginSuccessShape(body: unknown): body is LoginSuccessShape {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  const tokenCandidate = b.accessToken ?? b.token;
  if (tokenCandidate !== undefined && typeof tokenCandidate !== 'string') return false;
  if (b.refreshToken !== undefined && typeof b.refreshToken !== 'string') return false;
  if (b.message !== undefined && typeof b.message !== 'string') return false;
  if (b.success !== undefined && typeof b.success !== 'boolean') return false;
  return true;
}

