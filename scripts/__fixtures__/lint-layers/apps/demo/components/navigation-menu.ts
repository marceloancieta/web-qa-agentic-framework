import type { Locator, Page } from '@playwright/test';
import { expect as softly } from '@playwright/test'; // expect-finding: page-object-asserts

export class NavigationMenu {
  constructor(
    private readonly page: Page,
    private readonly collapsed: boolean,
  ) {}

  items(): Locator {
    return this.page.getByRole('navigation').getByRole('link');
  }

  async open(item: string): Promise<void> {
    if (this.collapsed) await this.page.getByRole('button', { name: 'Open menu' }).click();
    expect.soft(this.items()).toBeTruthy(); // expect-finding: page-object-asserts
    await this.page.getByRole('link', { name: item }).click();
    void softly;
  }

  expectation(): string {
    return 'a method whose name starts with expect is not an assertion';
  }
}

declare const expect: { soft: (value: unknown) => { toBeTruthy: () => void } };
