// A section of the dashboard (`/dashboard/<store id>/<section>`): its heading, its table and the
// controls above it. Orders, Products, Customers, Staff and Roles share this layout; the dashboard's
// home is the section with no path. A section the role cannot read keeps its heading and controls
// over a table without rows (contract `docs/features/roles.md`, LOCAL-48).

import type { Locator, Page } from '@playwright/test';

/** The store's id in a dashboard address, such as `store_ab12` in `/dashboard/store_ab12/orders`. */
export function storeIdOf(url: string): string {
  const id = /\/dashboard\/(store_[^/?#]+)/.exec(new URL(url).pathname)?.[1];
  if (!id) throw new Error(`No store id in ${new URL(url).pathname}.`);
  return id;
}

/**
 * Open the dashboard as a signed-in member: `/dashboard` moves to the store's home, and the store's
 * id is read from that address (docs/app-notes.md).
 */
export async function openDashboard(page: Page): Promise<SectionPage> {
  await page.goto('dashboard');
  await page.waitForURL(/\/dashboard\/store_[^/]+\/?$/);
  return new SectionPage(page, storeIdOf(page.url()));
}

export class SectionPage {
  constructor(
    private readonly page: Page,
    readonly storeId: string,
  ) {}

  /** Open `path` under the store, such as `orders` or `settings/staff`; '' for the home. */
  async open(path = ''): Promise<void> {
    await this.page.goto(`dashboard/${this.storeId}${path ? `/${path}` : ''}`);
  }

  /**
   * Open `path` and wait for the answer to the first list the page asks the admin API for among
   * `resources` (`products`, `admin_users`...); its status. Until that answer, an empty table is
   * only a loading one.
   */
  async openAndWaitForList(path: string, resources: readonly string[]): Promise<number> {
    const listed = new RegExp(`^/api/v3/admin/(${resources.join('|')})$`);
    const answer = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && listed.test(new URL(response.url()).pathname),
    );
    await this.open(path);
    return (await answer).status();
  }

  /** The address of `path` under the store, as the page shows it. */
  url(path = ''): RegExp {
    const tail = path ? `/${path}` : '';
    return new RegExp(`/dashboard/${this.storeId}${tail.replace(/\//g, '\\/')}/?$`);
  }

  heading(name: string): Locator {
    return this.page.getByRole('main').getByRole('heading', { name, level: 1, exact: true });
  }

  /**
   * The table's rows that hold a record: rows with cells that read something. The header row has
   * column headers, not cells, and the placeholder rows of a loading or refused table read nothing.
   */
  records(): Locator {
    return this.page
      .getByRole('main')
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell') })
      .filter({ hasText: /\w/ });
  }

  /** The row of one record, named by its cells, such as an order number or a product name. */
  record(text: string): Locator {
    return this.records().filter({ hasText: text });
  }

  /** A control above the table, a button or a link: "New Order", "Add product", "Export". */
  control(name: string): Locator {
    const main = this.page.getByRole('main');
    return main
      .getByRole('button', { name, exact: true })
      .or(main.getByRole('link', { name, exact: true }));
  }

  /** The section's content, inside which a wide table scrolls on its own on narrow screens. */
  main(): Locator {
    return this.page.getByRole('main');
  }

  /**
   * Record, from now on, every answer of the admin API the page gets in the 4xx range, as
   * `<METHOD> <path> <status>`: what a refused section refused, and anything else it should not.
   */
  watchRefusals(): { seen(): string[] } {
    const seen: string[] = [];
    this.page.on('response', (response) => {
      const { pathname } = new URL(response.url());
      const status = response.status();
      if (pathname.startsWith('/api/v3/admin/') && status >= 400 && status < 500) {
        seen.push(`${response.request().method()} ${pathname} ${status}`);
      }
    });
    return { seen: () => [...seen] };
  }

  images(): Locator {
    return this.page.getByRole('img');
  }

  /** A message that says access is refused, which the dashboard does not show yet (LOCAL-48). */
  accessRefused(): Locator {
    return this.page
      .getByRole('main')
      .getByText(/permission|not allowed|access (is )?(denied|refused)|not authori[sz]ed/i);
  }
}
