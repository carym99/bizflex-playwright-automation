export type MfaRequiredShape = {
  success: boolean;
  message: string;
  requires2FA: boolean;
  userId: string;
  accessToken?: undefined;
  refreshToken?: undefined;
};

export function isMfaRequiredShape(body: unknown): body is MfaRequiredShape {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    b.success === true &&
    b.message === '2FA code sent to registered email' &&
    b.requires2FA === true &&
    typeof b.userId === 'string'
  );
}

