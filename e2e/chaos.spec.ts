import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';

/** Chaos pass (building_plan P10): network loss, abandoned host, command spam. */
test.describe.configure({ timeout: 180_000 });

const VIDEO = 'https://youtu.be/dQw4w9WgXcQ';
const person = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();
const people = (page: Page): Locator => page.getByRole('list', { name: 'People in the room' });
const row = (page: Page, name: string): Locator => page.getByTestId(`participant-${name}`);

const hostRoom = async (browser: Browser): Promise<Page> => {
  const host = await person(browser);
  await host.goto('/');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByLabel(/First video/).fill(VIDEO);
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.getByRole('button', { name: 'Play', exact: true }).click();
  return host;
};

const joinAs = async (browser: Browser, url: string, name: string): Promise<Page> => {
  const page = await person(browser);
  await page.goto(url);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the party' }).click();
  await expect(row(page, name)).toBeVisible();
  return page;
};

test('a network drop while the player loads recovers once back online', async ({ browser }) => {
  const host = await hostRoom(browser);
  const sam = await person(browser);
  await sam.goto(host.url());
  await sam.getByLabel('Your name').fill('Sam');
  await sam.getByRole('button', { name: 'Join the party' }).click();
  await expect(row(sam, 'Sam')).toBeVisible();
  // Cut the network immediately, before the YouTube player has had a chance to load.
  await sam.context().setOffline(true);
  await sam.waitForTimeout(5_000);
  await sam.context().setOffline(false);
  await expect(sam.getByTestId('player')).toHaveAttribute('data-player-state', 'playing', {
    timeout: 60_000,
  });
  await expect(row(sam, 'Sam')).toBeVisible();
  await expect(row(host, 'Sam')).toBeVisible();
});

test('a short network drop is absorbed without leaving the room', async ({ browser }) => {
  const host = await hostRoom(browser);
  const sam = await joinAs(browser, host.url(), 'Sam');
  // Let the player load first; the drop-during-load case is covered above.
  await expect(sam.getByTestId('player')).toHaveAttribute('data-player-state', 'playing', {
    timeout: 30_000,
  });
  await sam.context().setOffline(true);
  await expect(sam.getByRole('status').filter({ hasText: 'Reconnecting…' })).toBeVisible({ timeout: 60_000 });
  await sam.context().setOffline(false);
  await expect(sam.getByRole('status').filter({ hasText: 'Reconnecting…' })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(row(host, 'Sam')).toBeVisible();
  await expect(row(host, 'Sam').getByText('Reconnecting…')).toHaveCount(0, { timeout: 30_000 });
  await expect(sam.getByTestId('player')).toHaveAttribute('data-player-state', 'playing', {
    timeout: 30_000,
  });
});

test('the host closing their tab hands the room to the next person after the grace period', async ({
  browser,
}) => {
  const host = await hostRoom(browser);
  const sam = await joinAs(browser, host.url(), 'Sam');
  await host.context().close();
  await expect(row(sam, 'Hana').getByText('Reconnecting…')).toBeVisible({ timeout: 10_000 });
  await expect(sam.getByText('You are now the host.')).toBeVisible({ timeout: 40_000 });
  await expect(row(sam, 'Hana')).toHaveCount(0);
  await expect(people(sam).getByText('Host')).toBeVisible();
  await expect(sam.getByRole('button', { name: /^(Play|Pause)$/ })).toBeEnabled();
});

test('spamming seeks is rate limited without breaking the room', async ({ browser }) => {
  const host = await hostRoom(browser);
  const sam = await joinAs(browser, host.url(), 'Sam');
  await host.locator('body').click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 25; i += 1) {
    await host.keyboard.press('ArrowRight');
  }
  await expect(host.getByText('Slow down a little.').first()).toBeVisible();
  await expect(sam.getByTestId('player')).toHaveAttribute('data-player-state', 'playing', {
    timeout: 30_000,
  });
  await expect
    .poll(
      async () => Math.abs(Number((await sam.getByTestId('player').getAttribute('data-drift-ms')) ?? 'NaN')),
      {
        timeout: 30_000,
      },
    )
    .toBeLessThan(1_000);
});
