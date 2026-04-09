import { setWorldConstructor, setDefaultTimeout, World } from '@cucumber/cucumber';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

export class E2EWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
}

setWorldConstructor(E2EWorld);
setDefaultTimeout(60_000);

