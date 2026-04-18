import type { APIRequestContext } from '@playwright/test';
import { loginByApi } from '../support/auth/loginByApi';

/**
 * Thin boundary for auth API calls. Extend with typed responses as API specs consolidate.
 */
export class AuthApiClient {
  constructor(private readonly request: APIRequestContext) {}

  login(email: string, password: string): Promise<unknown> {
    return loginByApi(this.request, email, password);
  }
}
