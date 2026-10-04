import { devices, expect, test } from '@playwright/test';

/**
 * The YouTube player on iPhone (WebKit). Desktop Chromium tolerates a page that withholds its
 * Referer, but YouTube refuses those embeds on iOS and mobile Chrome ("video unavailable", error
 * 150/153), which made every video unplayable there. Guards the server's Referrer-Policy.
 */
const { defaultBrowserType: _, ...iPhone } = devices['iPhone 15'];
test.use({ ...iPhone, browserName: 'webkit' });
test.describe.configure({ timeout: 90_000 });

test('a video plays in the YouTube player on iPhone', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Ivy');
  await page.getByLabel(/First video/).fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByTestId('participant-Ivy')).toBeVisible();
  const player = page.getByTestId('player');
  await expect(player).toHaveAttribute('data-player-state', 'cued', { timeout: 30_000 });
  await expect(player).not.toHaveAttribute('data-sync-status', /error|unavailable|rejected/);
  await expect(page.getByText("This video can't be played here")).toHaveCount(0);
});

test('the player controls fit an iPhone in portrait and landscape, without desktop-only controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Ivy');
  await page.getByLabel(/First video/).fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByTestId('participant-Ivy')).toBeVisible();
  const bar = page.getByTestId('control-bar');
  const fitsWidth = (): Promise<boolean> =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // Touch: hardware volume buttons instead of a slider; no keyboard-shortcut help.
  await expect(page.getByRole('slider', { name: 'Volume' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();
  await expect(bar.getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Full screen', exact: true })).toBeVisible();
  expect(await fitsWidth()).toBe(true);

  // Fullscreen follows rotation and keeps every control on screen.
  await bar.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect(page.getByTestId('player-frame')).toHaveAttribute('data-immersive', 'true');
  for (const size of [
    { width: 393, height: 852 },
    { width: 852, height: 393 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toBeInViewport({ ratio: 1 });
    expect(await fitsWidth()).toBe(true);
  }
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(page.getByTestId('player-frame')).toHaveAttribute('data-immersive', 'false');
});
