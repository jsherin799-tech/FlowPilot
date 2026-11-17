import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly adminDemoButton: Locator;
  readonly pmDemoButton: Locator;
  readonly devDemoButton: Locator;
  readonly qaDemoButton: Locator;

  constructor(page: Page) {
    this.page          = page;
    this.emailInput    = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton  = page.locator('button[type="submit"]');
    this.adminDemoButton = page.getByText('Admin').first();
    this.pmDemoButton    = page.getByText('Project Manager');
    this.devDemoButton   = page.getByText('Developer');
    this.qaDemoButton    = page.getByText('QA Engineer');
  }

  async goto() {
    await this.page.goto('/');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async loginAsAdmin() {
    await this.adminDemoButton.click();
    await this.submitButton.click();
  }

  async loginAsQA() {
    await this.qaDemoButton.click();
    await this.submitButton.click();
  }

  async waitForDashboard() {
    await this.page.waitForURL('**/dashboard', { timeout: 10_000 });
  }
}
