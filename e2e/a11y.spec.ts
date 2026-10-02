import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

/** WCAG 2.x A/AA rules. The YouTube iframe is third-party content and out of our control. */
const audit = async (page: Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('iframe')
      .analyze()
  ).violations.map((v) => ({ rule: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }));

type Theme = 'dark' | 'light';

/** A fresh browser profile with the theme saved the way the app's theme toggle saves it. */
const themedPage = async (browser: Browser, theme: Theme): Promise<Page> => {
  const context = await browser.newContext();
  await context.addInitScript((value) => {
    window.localStorage.setItem('watchparty-theme', value);
  }, theme);
  return context.newPage();
};

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test('landing page has no accessibility violations', async ({ browser }) => {
      const page = await themedPage(browser, theme);
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible();
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
      expect(await audit(page)).toEqual([]);
    });

    test('room has no accessibility violations, in every sidebar tab', async ({ browser }) => {
      const page = await themedPage(browser, theme);
      await page.goto('/');
      await page.getByLabel('Your name').fill('Hana');
      await page.getByLabel(/First video/).fill('https://youtu.be/dQw4w9WgXcQ');
      await page.getByRole('button', { name: 'Create room' }).click();
      await expect(page.getByTestId('participant-Hana')).toBeVisible();

      // A guest opening the link sees the name prompt first.
      const guest = await themedPage(browser, theme);
      await guest.goto(page.url());
      await expect(guest.getByLabel('Your name')).toBeVisible();
      expect(await audit(guest)).toEqual([]);

      expect(await audit(page)).toEqual([]);
      for (const tab of [/Chat/, /Queue/, /Requests/]) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        expect(await audit(page)).toEqual([]);
      }
    });
  });
}
