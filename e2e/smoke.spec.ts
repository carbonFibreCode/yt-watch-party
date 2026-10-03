import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';

/** Release smoke checks not covered by the other specs. */
test.describe.configure({ timeout: 120_000 });

const SYNC_TIMEOUT_MS = 20_000;
const MAX_DRIFT_MS = 1_000;

const person = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();
const player = (page: Page): Locator => page.getByTestId('player');
const playButton = (page: Page): Locator =>
  page.getByRole('button', { name: /^(Ask to play|Ask to pause|Play|Pause)$/, exact: true });

const expectInSync = async (page: Page): Promise<void> => {
  await expect
    .poll(
      async () => {
        const drift = await player(page).getAttribute('data-drift-ms');
        return drift === null || drift === '' ? Number.POSITIVE_INFINITY : Math.abs(Number(drift));
      },
      { timeout: SYNC_TIMEOUT_MS },
    )
    .toBeLessThan(MAX_DRIFT_MS);
};

test('a refresh keeps role and position; demotion locks the controls again', async ({ browser }) => {
  const host = await person(browser);
  await host.goto('/');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByLabel(/First video/).fill('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(player(host)).toHaveAttribute('data-player-state', 'playing', { timeout: SYNC_TIMEOUT_MS });

  const mo = await person(browser);
  await mo.goto(host.url());
  await mo.getByLabel('Your name').fill('Mo');
  await mo.getByRole('button', { name: 'Join the party' }).click();
  await host.getByRole('button', { name: 'Actions for Mo' }).click();
  await host.getByRole('menuitem', { name: 'Make moderator' }).click();
  await expect(playButton(mo)).toHaveAccessibleName('Pause');

  // Refresh mid-video: same role, back at the room's position (within the sync tolerance).
  await mo.reload();
  await expect(playButton(mo)).toHaveAccessibleName('Pause');
  await expect(mo.getByTestId('participant-Mo').getByText('Moderator')).toBeVisible();
  await expect(player(mo)).toHaveAttribute('data-player-state', 'playing', { timeout: SYNC_TIMEOUT_MS });
  await expectInSync(mo);

  // Demotion: Mo's controls turn back into requests.
  await host.getByRole('button', { name: 'Actions for Mo' }).click();
  await host.getByRole('menuitem', { name: 'Make participant' }).click();
  await expect(mo.getByText('You are now a participant.')).toBeVisible();
  await expect(playButton(mo)).toHaveAccessibleName('Ask to pause');
  await expect(mo.getByRole('tab', { name: /Requests/ })).toHaveCount(0);
});
