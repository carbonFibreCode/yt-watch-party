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
