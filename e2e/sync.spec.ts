import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';

const FIRST_VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SECOND_VIDEO = 'https://youtu.be/jNQXAC9IVRw';
const SYNC_TIMEOUT_MS = 20_000;
const MAX_DRIFT_MS = 1_000;

test.describe.configure({ timeout: 120_000 });

const person = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();
const player = (page: Page): Locator => page.getByTestId('player');

const expectPlayerState = async (page: Page, state: string): Promise<void> => {
  await expect(player(page)).toHaveAttribute('data-player-state', state, { timeout: SYNC_TIMEOUT_MS });
};

/** Waits until the engine has measured drift (after a cooldown) and it is within tolerance. */
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

test('playback stays in sync between host and guest', async ({ browser }) => {
  const host = await person(browser);
  await host.goto('/');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByLabel(/First video/).fill(FIRST_VIDEO);
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(host.getByText('Rick Astley', { exact: false }).first()).toBeVisible();

  // The first video is cued paused; the host starts it.
  await expectPlayerState(host, 'cued');
  await host.getByRole('button', { name: 'Play', exact: true }).click();
  await expectPlayerState(host, 'playing');

  const guest = await person(browser);
  await guest.goto(host.url());
  await guest.getByLabel('Your name').fill('Sam');
  await guest.getByRole('button', { name: 'Join the party' }).click();
  await expectPlayerState(guest, 'playing');
  await expectInSync(guest);

  // Pause and resume propagate.
  await host.getByRole('button', { name: 'Pause', exact: true }).click();
  await expectPlayerState(guest, 'paused');
  await host.getByRole('button', { name: 'Play', exact: true }).click();
  await expectPlayerState(guest, 'playing');

  // Seek forward 30 s with the keyboard; both stay within tolerance.
  await host.locator('body').click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 6; i += 1) {
    await host.keyboard.press('ArrowRight');
  }
  await expectInSync(guest);
  await expectInSync(host);

  // A participant's control asks instead of acting.
  await guest.getByRole('button', { name: 'Ask to pause' }).click();
  await expect(guest.getByText('Asked the host for a pause.')).toBeVisible();
  await expectPlayerState(host, 'playing');

  // Changing the video reaches everyone.
  await host.getByLabel('YouTube link').fill(SECOND_VIDEO);
  await host.getByRole('button', { name: 'Play now' }).click();
  await expect(guest.getByText('Me at the zoo')).toBeVisible({ timeout: SYNC_TIMEOUT_MS });
  await expectPlayerState(guest, 'playing');
});
