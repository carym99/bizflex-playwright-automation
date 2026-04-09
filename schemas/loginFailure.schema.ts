export type LoginFailureShape = {
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;
  statusCode?: number;
};

export function isLoginFailureShape(body: unknown): body is LoginFailureShape {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (b.success !== undefined && typeof b.success !== 'boolean') return false;
  if (b.code !== undefined && typeof b.code !== 'string') return false;
  if (b.message !== undefined && typeof b.message !== 'string') return false;
  if (b.error !== undefined && typeof b.error !== 'string') return false;
  if (b.statusCode !== undefined && typeof b.statusCode !== 'number') return false;
  return true;
}

