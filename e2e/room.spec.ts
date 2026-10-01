import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

/** A separate browser profile (own cookies) per person. */
const person = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();

test.describe('rooms in two browsers', () => {
  test('a guest joins the host by invite link and both see each other', async ({ browser }) => {
    const host = await person(browser);
    await host.goto('/');
    await host.getByLabel('Your name').fill('Hana');
    await host.getByLabel(/Room name/).fill('E2E movie night');
    await host.getByRole('button', { name: 'Create room' }).click();
    await expect(host).toHaveURL(/\/r\/[23456789A-Z]{6}$/);
    await expect(host.getByRole('heading', { name: 'E2E movie night' })).toBeVisible();
    const people = host.getByRole('complementary', { name: 'Room sidebar' });
    await expect(people.getByText('Hana (you)')).toBeVisible();
    await expect(people.getByText('Host')).toBeVisible();

    const guest = await person(browser);
    await guest.goto(host.url());
    await expect(guest.getByText('Hosted by Hana')).toBeVisible();
    await guest.getByLabel('Your name').fill('Sam');
    await guest.getByRole('button', { name: 'Join the party' }).click();
    const guestPeople = guest.getByRole('complementary', { name: 'Room sidebar' });
    await expect(guestPeople.getByText('Sam (you)')).toBeVisible();
    await expect(guestPeople.getByText('Hana')).toBeVisible();

    await expect(people.getByText('Sam')).toBeVisible();
    await expect(people.getByText('People · 2')).toBeVisible();

    await guest.context().close();
    await expect(people.getByText('Reconnecting…')).toBeVisible();
  });

  test('unknown rooms and bad codes get a clear page', async ({ page }) => {
    await page.goto('/r/ZZZZZZ');
    await expect(page.getByRole('heading', { name: "This room doesn't exist" })).toBeVisible();
    await page.goto('/r/nope');
    await expect(page.getByRole('heading', { name: "That room code isn't valid" })).toBeVisible();
  });

  test('joining from the landing page with a pasted link', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Room code or link').fill('not a code');
    await page.getByRole('button', { name: 'Join room' }).click();
    await expect(page.getByRole('alert')).toContainText('6-character room code');
  });
});
