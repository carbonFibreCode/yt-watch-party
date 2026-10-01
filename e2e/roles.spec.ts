import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });

const person = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();
const row = (page: Page, name: string): Locator => page.getByTestId(`participant-${name}`);
/** The control bar's play/pause button, whatever the role-specific label. */
const playButton = (page: Page): Locator =>
  page.getByRole('button', { name: /^(Ask to play|Ask to pause|Play|Pause)$/, exact: true });

const join = async (browser: Browser, url: string, name: string): Promise<Page> => {
  const page = await person(browser);
  await page.goto(url);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the party' }).click();
  await expect(row(page, name)).toBeVisible();
  return page;
};

const memberAction = async (page: Page, target: string, item: string): Promise<void> => {
  await page.getByRole('button', { name: `Actions for ${target}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test('roles, requests and moderation across three browsers', async ({ browser }) => {
  const host = await person(browser);
  await host.goto('/');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByLabel(/First video/).fill('https://youtu.be/dQw4w9WgXcQ');
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.getByRole('button', { name: 'Play', exact: true }).click();
  const url = host.url();

  const mo = await join(browser, url, 'Mo');
  const pat = await join(browser, url, 'Pat');

  // Participants ask instead of acting; nobody but the host gets member actions.
  await expect(playButton(pat)).toHaveAccessibleName('Ask to pause');
  await expect(pat.getByRole('button', { name: /Actions for/ })).toHaveCount(0);
  await expect(mo.getByRole('tab', { name: /Requests/ })).toHaveCount(0);

  // Host promotes Mo: Mo's controls unlock and the Requests tab appears for Mo.
  await memberAction(host, 'Mo', 'Make moderator');
  await expect(row(host, 'Mo').getByText('Moderator')).toBeVisible();
  await expect(playButton(mo)).toHaveAccessibleName('Pause');
  await expect(mo.getByRole('tab', { name: /Requests/ })).toBeVisible();
  await expect(mo.getByText('You are now a moderator.')).toBeVisible();

  // A moderator may remove participants but not change roles.
  await mo.getByRole('button', { name: 'Actions for Pat' }).click();
  await expect(mo.getByRole('menuitem', { name: 'Remove from room' })).toBeVisible();
  await expect(mo.getByRole('menuitem', { name: /Make/ })).toHaveCount(0);
  await mo.keyboard.press('Escape');
  await expect(mo.getByRole('button', { name: 'Actions for Hana' })).toHaveCount(0);

  // Pat asks to pause; staff see it as a toast and in the Requests tab; Mo approves.
  await playButton(pat).click();
  await expect(pat.getByText('Asked the host for a pause.')).toBeVisible();
  await expect(host.getByText('Pat wants to pause').first()).toBeVisible();
  await mo.getByRole('tab', { name: /Requests/ }).click();
  const card = mo.getByTestId('request-card');
  await expect(card).toContainText('Pat wants to pause');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(pat.getByText('Mo approved your request.')).toBeVisible();
  await expect(host.getByTestId('player')).toHaveAttribute('data-player-state', 'paused', {
    timeout: 20_000,
  });
  await expect(card).toHaveCount(0);

  // A rejected request changes nothing and tells the requester.
  await playButton(pat).click();
  await host.getByRole('tab', { name: /Requests/ }).click();
  await host.getByTestId('request-card').getByRole('button', { name: 'Reject' }).click();
  await expect(pat.getByText('Hana declined your request.')).toBeVisible();
  await expect(host.getByTestId('player')).toHaveAttribute('data-player-state', 'paused');

  // Removal: Pat is sent away and cannot come back.
  await host.getByRole('tab', { name: /People/ }).click();
  await memberAction(host, 'Pat', 'Remove from room');
  await host.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(pat).toHaveURL(/\/removed$/);
  await expect(row(host, 'Pat')).toHaveCount(0);
  await pat.goto(url);
  await expect(pat.getByRole('heading', { name: "You can't rejoin this room" })).toBeVisible();

  // Host hands over: roles swap everywhere.
  await memberAction(host, 'Mo', 'Make host');
  await host.getByRole('button', { name: 'Make host', exact: true }).click();
  await expect(mo.getByText('You are now the host.')).toBeVisible();
  await expect(row(host, 'Mo').getByText('Host')).toBeVisible();
  await mo.getByRole('tab', { name: /People/ }).click();
  await expect(row(mo, 'Hana').getByText('Moderator')).toBeVisible();
});
